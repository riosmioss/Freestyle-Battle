import { nanoid } from 'nanoid';
import type {
  Beat,
  LeaderboardEntry,
  Phase,
  Player,
  PlayerRoundScore,
  PublicLobby,
  RoomState,
  RoundResults,
} from './types.js';

const COUNTDOWN_MS = 5000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused chars

function makeCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken.has(code)) return code;
  }
  // Fallback — astronomically unlikely.
  return nanoid(4).toUpperCase();
}

// Internal room model (richer than the broadcast snapshot).
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

  countdownEndsAt: number | null;
  roundStartTimestamp: number | null;
  roundEndsAt: number | null;

  // raterId -> (targetId -> score)
  ratings: Map<string, Map<string, number>>;

  results: RoundResults | null;

  // cumulative across rounds, keyed by player id (survives if player leaves)
  totals: Map<string, { handle: string; totalPoints: number; roundsWon: number }>;

  // timers we may need to cancel
  timers: NodeJS.Timeout[];
}

export class Store {
  private rooms = new Map<string, Room>();
  // socket id -> room code, so we can find a player's room on disconnect
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
      countdownEndsAt: null,
      roundStartTimestamp: null,
      roundEndsAt: null,
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

  // Returns the affected room (if any) and whether the room was deleted.
  removePlayer(socketId: string): { room?: Room; deleted: boolean } {
    const room = this.getRoomBySocket(socketId);
    this.socketRoom.delete(socketId);
    if (!room) return { deleted: false };

    room.players.delete(socketId);
    // Keep their accumulated ratings out of future tallies.
    room.ratings.delete(socketId);

    if (room.players.size === 0) {
      this.destroyRoom(room);
      return { deleted: true };
    }

    // Host migration: hand off to the next player still present.
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

  setPublic(room: Room, isPublic: boolean) {
    room.isPublic = isPublic;
  }

  // The browsable list of joinable public lobbies for the home screen.
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
    // Lobbies waiting for players first, then by fullest.
    list.sort((a, b) => {
      if (a.phase === 'lobby' && b.phase !== 'lobby') return -1;
      if (b.phase === 'lobby' && a.phase !== 'lobby') return 1;
      return b.playerCount - a.playerCount;
    });
    return list;
  }

  addBeat(room: Room, videoId: string, label: string, addedBy: string): Beat {
    const beat: Beat = { id: nanoid(8), videoId, label, addedBy };
    room.beats.push(beat);
    if (!room.activeBeatId) room.activeBeatId = beat.id;
    return beat;
  }

  // Advance the active beat to the next one in the crate, wrapping around.
  rotateActiveBeat(room: Room) {
    if (room.beats.length <= 1) return;
    const idx = room.beats.findIndex((b) => b.id === room.activeBeatId);
    const next = room.beats[(idx + 1) % room.beats.length];
    room.activeBeatId = next.id;
  }

  removeBeat(room: Room, beatId: string) {
    room.beats = room.beats.filter((b) => b.id !== beatId);
    if (room.activeBeatId === beatId) {
      room.activeBeatId = room.beats[0]?.id ?? null;
    }
  }

  // ---- Phase transitions (server-authoritative) ----

  // Begins the synced countdown. `onPhase` is called whenever the room should
  // be re-broadcast (countdown -> battle -> rating).
  startBattle(room: Room, onPhase: (room: Room) => void): { error?: string } {
    if (room.phase !== 'lobby' && room.phase !== 'results') {
      return { error: 'Battle already in progress.' };
    }
    if (!room.activeBeatId) return { error: 'Pick a beat first.' };

    room.timers.forEach(clearTimeout);
    room.timers = [];

    const now = Date.now();
    room.phase = 'countdown';
    room.roundNumber += 1;
    room.ratings = new Map();
    room.results = null;
    room.countdownEndsAt = now + COUNTDOWN_MS;
    room.roundStartTimestamp = room.countdownEndsAt; // beat drops when countdown hits 0
    room.roundEndsAt = room.roundStartTimestamp + room.roundLength * 1000;

    onPhase(room);

    room.timers.push(
      setTimeout(() => {
        room.phase = 'battle';
        onPhase(room);
      }, COUNTDOWN_MS),
    );

    room.timers.push(
      setTimeout(() => {
        this.enterRating(room, onPhase);
      }, COUNTDOWN_MS + room.roundLength * 1000),
    );

    return {};
  }

  private enterRating(room: Room, onPhase: (room: Room) => void) {
    room.phase = 'rating';
    onPhase(room);

    // Safety net: if not everyone rates, finalize after a generous window.
    room.timers.push(
      setTimeout(() => {
        if (room.phase === 'rating') this.finalizeResults(room, onPhase);
      }, 90_000),
    );
  }

  submitRating(
    room: Room,
    raterId: string,
    ratings: Record<string, number>,
    onPhase: (room: Room) => void,
  ): { error?: string } {
    if (room.phase !== 'rating') return { error: 'Not in the rating phase.' };
    if (!room.players.has(raterId)) return { error: 'You are not in this room.' };

    const clean = new Map<string, number>();
    for (const [targetId, score] of Object.entries(ratings)) {
      if (targetId === raterId) continue; // can't rate yourself
      if (!room.players.has(targetId)) continue;
      const s = Math.round(Number(score));
      if (Number.isFinite(s) && s >= 1 && s <= 10) clean.set(targetId, s);
    }
    room.ratings.set(raterId, clean);

    // Finalize once every currently-online player has submitted.
    const onlineRaters = [...room.players.values()].filter((p) => p.online).map((p) => p.id);
    const allSubmitted = onlineRaters.every((id) => room.ratings.has(id));
    if (allSubmitted) this.finalizeResults(room, onPhase);
    else onPhase(room);

    return {};
  }

  private finalizeResults(room: Room, onPhase: (room: Room) => void) {
    if (room.phase === 'results') return;

    // Tally: for each target, average the scores they received.
    const received = new Map<string, number[]>();
    for (const byTarget of room.ratings.values()) {
      for (const [targetId, score] of byTarget) {
        if (!received.has(targetId)) received.set(targetId, []);
        received.get(targetId)!.push(score);
      }
    }

    const scores: PlayerRoundScore[] = [...room.players.values()].map((p) => {
      const list = received.get(p.id) ?? [];
      const average = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
      return {
        playerId: p.id,
        handle: p.handle,
        average: Math.round(average * 100) / 100,
        votes: list.length,
      };
    });
    scores.sort((a, b) => b.average - a.average);

    // Winner: top average, but only if they actually received votes.
    const top = scores[0];
    const winnerId = top && top.votes > 0 && top.average > 0 ? top.playerId : null;

    // Accumulate cumulative totals (survives disconnects).
    for (const s of scores) {
      const entry = room.totals.get(s.playerId) ?? {
        handle: s.handle,
        totalPoints: 0,
        roundsWon: 0,
      };
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
    onPhase(room);
  }

  // Host advances: go back to lobby to pick the next beat / round.
  returnToLobby(room: Room) {
    room.timers.forEach(clearTimeout);
    room.timers = [];
    room.phase = 'lobby';
    room.countdownEndsAt = null;
    room.roundStartTimestamp = null;
    room.roundEndsAt = null;
    room.ratings = new Map();
  }

  // ---- Snapshot for broadcast ----
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
      countdownEndsAt: room.countdownEndsAt,
      roundStartTimestamp: room.roundStartTimestamp,
      roundEndsAt: room.roundEndsAt,
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
    // Include players who haven't scored yet so the lobby shows everyone.
    for (const p of room.players.values()) {
      if (!room.totals.has(p.id)) {
        entries.push({
          playerId: p.id,
          handle: p.handle,
          online: p.online,
          totalPoints: 0,
          roundsWon: 0,
        });
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

export type { Room };
