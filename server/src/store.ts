import { nanoid } from 'nanoid';
import type {
  Beat,
  LeaderboardEntry,
  Phase,
  Player,
  PlayerRoundScore,
  PublicLobby,
  RecordingMeta,
  RoomState,
  RoundResults,
} from './types.js';

const COUNTDOWN_MS = 5000; // "beat drops in 5..." before everyone records
const UPLOAD_GRACE_MS = 15000; // time after the window for uploads to land
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars

function makeCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken.has(code)) return code;
  }
  return nanoid(4).toUpperCase();
}

interface StoredRecording {
  beatOffset: number;
  mimeType: string;
  data: Buffer;
}

// Callbacks the store uses to push updates out (kept transport-agnostic).
export interface RoundCallbacks {
  broadcast: (room: Room) => void; // re-send roomState
  recordings: (room: Room) => void; // ship the recorded takes to clients
}

interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  isPublic: boolean;
  players: Map<string, Player>;
  beats: Beat[];
  activeBeatId: string | null;
  roundLength: number;
  roundNumber: number;

  // Simultaneous performance: everyone records at once.
  expectedPerformers: string[]; // who was online when the round started
  countdownEndsAt: number | null;
  performStartTimestamp: number | null; // beat drop / record start (t=0)
  performEndsAt: number | null;
  recordings: Map<string, StoredRecording>;

  // raterId -> (targetId -> score)
  ratings: Map<string, Map<string, number>>;
  results: RoundResults | null;

  // cumulative across rounds, keyed by player id (survives if player leaves)
  totals: Map<string, { handle: string; totalPoints: number; roundsWon: number }>;

  timers: NodeJS.Timeout[];
}

export class Store {
  private rooms = new Map<string, Room>();
  private socketRoom = new Map<string, string>();

  getRoomByCode(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }
  getRoomBySocket(socketId: string): Room | undefined {
    const code = this.socketRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  createRoom(socketId: string, handle: string, isPublic: boolean): Room {
    const code = makeCode(new Set(this.rooms.keys()));
    const room: Room = {
      code,
      hostId: socketId,
      phase: 'lobby',
      isPublic,
      players: new Map(),
      beats: [],
      activeBeatId: null,
      roundLength: 60,
      roundNumber: 0,
      expectedPerformers: [],
      countdownEndsAt: null,
      performStartTimestamp: null,
      performEndsAt: null,
      recordings: new Map(),
      ratings: new Map(),
      results: null,
      totals: new Map(),
      timers: [],
    };
    room.players.set(socketId, { id: socketId, handle: cleanHandle(handle), online: true });
    this.rooms.set(code, room);
    this.socketRoom.set(socketId, code);
    return room;
  }

  joinRoom(socketId: string, code: string, handle: string): { room?: Room; error?: string } {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return { error: 'No battle found with that code.' };
    if (room.players.size >= 8 && !room.players.has(socketId)) {
      return { error: 'This lobby is full (8 max).' };
    }
    room.players.set(socketId, { id: socketId, handle: cleanHandle(handle), online: true });
    this.socketRoom.set(socketId, code.toUpperCase());
    return { room };
  }

  removePlayer(socketId: string): { room?: Room; deleted: boolean } {
    const room = this.getRoomBySocket(socketId);
    this.socketRoom.delete(socketId);
    if (!room) return { deleted: false };

    room.players.delete(socketId);
    room.ratings.delete(socketId);

    if (room.players.size === 0) {
      this.destroyRoom(room);
      return { deleted: true };
    }
    if (room.hostId === socketId) {
      const next = room.players.keys().next().value as string | undefined;
      if (next) room.hostId = next;
    }
    return { room, deleted: false };
  }

  private destroyRoom(room: Room) {
    room.timers.forEach(clearTimeout);
    room.timers = [];
    this.rooms.delete(room.code);
  }

  addBeat(room: Room, videoId: string, label: string, addedBy: string): Beat {
    const beat: Beat = { id: nanoid(8), videoId, label, addedBy };
    room.beats.push(beat);
    if (!room.activeBeatId) room.activeBeatId = beat.id;
    return beat;
  }

  rotateActiveBeat(room: Room) {
    if (room.beats.length <= 1) return;
    const idx = room.beats.findIndex((b) => b.id === room.activeBeatId);
    const next = room.beats[(idx + 1) % room.beats.length];
    room.activeBeatId = next.id;
  }

  removeBeat(room: Room, beatId: string) {
    room.beats = room.beats.filter((b) => b.id !== beatId);
    if (room.activeBeatId === beatId) room.activeBeatId = room.beats[0]?.id ?? null;
  }

  setPublic(room: Room, isPublic: boolean) {
    room.isPublic = isPublic;
  }

  publicLobbies(): PublicLobby[] {
    const list: PublicLobby[] = [];
    for (const room of this.rooms.values()) {
      if (!room.isPublic || room.players.size === 0) continue;
      const host = room.players.get(room.hostId);
      list.push({
        code: room.code,
        hostHandle: host?.handle ?? 'MC Anonymous',
        playerCount: room.players.size,
        phase: room.phase,
        roundNumber: room.roundNumber,
      });
    }
    list.sort((a, b) => {
      if (a.phase === 'lobby' && b.phase !== 'lobby') return -1;
      if (b.phase === 'lobby' && a.phase !== 'lobby') return 1;
      return b.playerCount - a.playerCount;
    });
    return list;
  }

  // ---- Round engine (everyone records simultaneously) ----

  startBattle(room: Room, cb: RoundCallbacks): { error?: string } {
    if (room.phase !== 'lobby' && room.phase !== 'results') {
      return { error: 'Battle already in progress.' };
    }
    if (!room.activeBeatId) return { error: 'Pick a beat first.' };

    const online = [...room.players.values()].filter((p) => p.online).map((p) => p.id);
    if (online.length === 0) return { error: 'No MCs to perform.' };

    room.timers.forEach(clearTimeout);
    room.timers = [];
    room.roundNumber += 1;
    room.expectedPerformers = online;
    room.recordings = new Map();
    room.ratings = new Map();
    room.results = null;

    const now = Date.now();
    room.phase = 'countdown';
    room.countdownEndsAt = now + COUNTDOWN_MS;
    room.performStartTimestamp = room.countdownEndsAt;
    room.performEndsAt = room.performStartTimestamp + room.roundLength * 1000;
    cb.broadcast(room);

    room.timers.push(
      setTimeout(() => {
        room.phase = 'performing';
        cb.broadcast(room);
      }, COUNTDOWN_MS),
    );
    // Backstop: move to rating after the window + grace, with whatever landed.
    room.timers.push(
      setTimeout(() => {
        if (room.phase === 'performing' || room.phase === 'countdown') this.enterRating(room, cb);
      }, COUNTDOWN_MS + room.roundLength * 1000 + UPLOAD_GRACE_MS),
    );

    return {};
  }

  submitRecording(
    room: Room,
    performerId: string,
    rec: StoredRecording,
    cb: RoundCallbacks,
  ): { error?: string } {
    if (room.phase !== 'performing') {
      return { error: 'Not in the recording phase.' };
    }
    if (!room.players.has(performerId)) return { error: 'You are not in this room.' };
    room.recordings.set(performerId, rec);
    // If everyone still here has uploaded, jump straight to rating.
    if (!this.maybeFinalize(room, cb)) cb.broadcast(room);
    return {};
  }

  // Move to rating once every still-present expected performer has uploaded.
  private maybeFinalize(room: Room, cb: RoundCallbacks): boolean {
    if (room.phase !== 'performing') return false;
    const pending = room.expectedPerformers.filter(
      (id) => room.players.has(id) && !room.recordings.has(id),
    );
    if (pending.length === 0) {
      this.enterRating(room, cb);
      return true;
    }
    return false;
  }

  // Re-check after a player leaves (they may have been the last one pending).
  recheckPerforming(room: Room, cb: RoundCallbacks) {
    this.maybeFinalize(room, cb);
  }

  private enterRating(room: Room, cb: RoundCallbacks) {
    room.timers.forEach(clearTimeout);
    room.timers = [];
    room.phase = 'rating';
    room.countdownEndsAt = null;
    room.performStartTimestamp = null;
    room.performEndsAt = null;

    cb.recordings(room); // ship takes to clients
    cb.broadcast(room);

    room.timers.push(
      setTimeout(() => {
        if (room.phase === 'rating') this.finalizeResults(room, cb);
      }, 120_000),
    );
  }

  submitRating(
    room: Room,
    raterId: string,
    ratings: Record<string, number>,
    cb: RoundCallbacks,
  ): { error?: string } {
    if (room.phase !== 'rating') return { error: 'Not in the rating phase.' };
    if (!room.players.has(raterId)) return { error: 'You are not in this room.' };

    const clean = new Map<string, number>();
    for (const [targetId, score] of Object.entries(ratings)) {
      if (targetId === raterId) continue;
      if (!room.recordings.has(targetId)) continue; // can only rate actual takes
      const s = Math.round(Number(score));
      if (Number.isFinite(s) && s >= 1 && s <= 10) clean.set(targetId, s);
    }
    room.ratings.set(raterId, clean);

    const onlineRaters = [...room.players.values()].filter((p) => p.online).map((p) => p.id);
    const allSubmitted = onlineRaters.every((id) => room.ratings.has(id));
    if (allSubmitted) this.finalizeResults(room, cb);
    else cb.broadcast(room);
    return {};
  }

  private finalizeResults(room: Room, cb: RoundCallbacks) {
    if (room.phase === 'results') return;

    const received = new Map<string, number[]>();
    for (const byTarget of room.ratings.values()) {
      for (const [targetId, score] of byTarget) {
        if (!received.has(targetId)) received.set(targetId, []);
        received.get(targetId)!.push(score);
      }
    }

    const performers = [...room.recordings.keys()];
    const scores: PlayerRoundScore[] = performers.map((pid) => {
      const list = received.get(pid) ?? [];
      const average = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
      return {
        playerId: pid,
        handle: room.players.get(pid)?.handle ?? room.totals.get(pid)?.handle ?? 'MC',
        average: Math.round(average * 100) / 100,
        votes: list.length,
      };
    });
    scores.sort((a, b) => b.average - a.average);

    const top = scores[0];
    const winnerId = top && top.votes > 0 && top.average > 0 ? top.playerId : null;

    for (const s of scores) {
      const entry = room.totals.get(s.playerId) ?? { handle: s.handle, totalPoints: 0, roundsWon: 0 };
      entry.handle = s.handle;
      entry.totalPoints = Math.round((entry.totalPoints + s.average) * 100) / 100;
      if (s.playerId === winnerId) entry.roundsWon += 1;
      room.totals.set(s.playerId, entry);
    }

    room.results = {
      roundNumber: room.roundNumber,
      beatLabel: room.beats.find((b) => b.id === room.activeBeatId)?.label ?? 'Unknown beat',
      scores,
      winnerId,
    };
    room.phase = 'results';
    room.timers.forEach(clearTimeout);
    room.timers = [];
    cb.broadcast(room);
  }

  returnToLobby(room: Room) {
    room.timers.forEach(clearTimeout);
    room.timers = [];
    room.phase = 'lobby';
    room.expectedPerformers = [];
    room.countdownEndsAt = null;
    room.performStartTimestamp = null;
    room.performEndsAt = null;
    room.recordings = new Map();
    room.ratings = new Map();
  }

  roundRecordings(room: Room): RecordingMeta[] {
    return [...room.recordings.entries()].map(([performerId, r]) => ({
      performerId,
      handle: room.players.get(performerId)?.handle ?? 'MC',
      beatOffset: r.beatOffset,
      mimeType: r.mimeType,
      data: r.data,
    }));
  }

  // ---- Snapshot ----
  snapshot(room: Room): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      players: [...room.players.values()],
      beats: room.beats,
      activeBeatId: room.activeBeatId,
      roundLength: room.roundLength,
      roundNumber: room.roundNumber,
      performedIds: [...room.recordings.keys()],
      countdownEndsAt: room.countdownEndsAt,
      performStartTimestamp: room.performStartTimestamp,
      performEndsAt: room.performEndsAt,
      ratingsSubmitted: [...room.ratings.keys()],
      results: room.results,
      leaderboard: this.leaderboard(room),
      isPublic: room.isPublic,
    };
  }

  private leaderboard(room: Room): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [...room.totals.entries()].map(([playerId, t]) => ({
      playerId,
      handle: t.handle,
      online: room.players.get(playerId)?.online ?? false,
      totalPoints: t.totalPoints,
      roundsWon: t.roundsWon,
    }));
    for (const p of room.players.values()) {
      if (!room.totals.has(p.id)) {
        entries.push({ playerId: p.id, handle: p.handle, online: p.online, totalPoints: 0, roundsWon: 0 });
      }
    }
    entries.sort((a, b) => b.totalPoints - a.totalPoints || b.roundsWon - a.roundsWon);
    return entries;
  }
}

function cleanHandle(handle: string): string {
  const h = (handle ?? '').trim().slice(0, 20);
  return h.length ? h : 'MC Anonymous';
}

export type { Room, StoredRecording };
