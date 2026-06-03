import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { Store, type Room } from './store.js';
import { parseYouTubeId } from './youtube.js';
import type {
  Ack,
  AddBeatPayload,
  CreateLobbyPayload,
  JoinLobbyPayload,
  RemoveBeatPayload,
  RtcSignalPayload,
  SelectBeatPayload,
  SetPublicPayload,
  SetRoundLengthPayload,
  SubmitRatingPayload,
} from './types.js';

// Socket.IO room that home-screen clients join to receive the live public
// lobby list (they aren't in a game room yet).
const HOME_ROOM = 'home-browser';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';
const ALLOWED_ROUND_LENGTHS = [30, 60, 90, 120];

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/', (_req, res) => res.json({ ok: true, service: 'freestyle-battle', rooms: 'in-memory' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const store = new Store();

// Broadcast the authoritative snapshot to everyone in a room.
function broadcast(room: Room) {
  io.to(room.code).emit('roomState', store.snapshot(room));
}

// Push the current public-lobby list to everyone browsing the home screen.
function broadcastLobbyList() {
  io.to(HOME_ROOM).emit('publicLobbies', store.publicLobbies());
}

// Combined: a game room changed AND the public list may have too (player count
// or phase). Used for phase transitions and roster changes.
function broadcastAll(room: Room) {
  broadcast(room);
  broadcastLobbyList();
}

io.on('connection', (socket) => {
  // Lightweight clock-sync endpoint. Client measures RTT and derives the
  // offset between its clock and the server's so synced timestamps line up.
  socket.on('timesync', (clientSent: number, ack: (serverTime: number) => void) => {
    if (typeof ack === 'function') ack(Date.now());
  });

  // Home-screen clients subscribe here to receive the live public lobby list.
  socket.on('watchLobbies', () => {
    socket.join(HOME_ROOM);
    socket.emit('publicLobbies', store.publicLobbies());
  });
  socket.on('unwatchLobbies', () => {
    socket.leave(HOME_ROOM);
  });

  socket.on('createLobby', (payload: CreateLobbyPayload, ack: Ack<{ code: string; you: string }>) => {
    const room = store.createRoom(socket.id, payload?.handle ?? '', !!payload?.isPublic);
    socket.join(room.code);
    socket.leave(HOME_ROOM); // they're in a game now, stop browsing
    ack?.({ ok: true, code: room.code, you: socket.id });
    broadcastAll(room);
  });

  socket.on('setPublic', (payload: SetPublicPayload, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    store.setPublic(room, !!payload?.isPublic);
    broadcastAll(room);
    ack?.({ ok: true });
  });

  socket.on('joinLobby', (payload: JoinLobbyPayload, ack: Ack<{ code: string; you: string }>) => {
    const code = (payload?.code ?? '').toUpperCase();
    const { room, error } = store.joinRoom(socket.id, code, payload?.handle ?? '');
    if (error || !room) {
      ack?.({ ok: false, error: error ?? 'Could not join.' });
      return;
    }
    socket.join(room.code);
    socket.leave(HOME_ROOM);
    ack?.({ ok: true, code: room.code, you: socket.id });
    broadcastAll(room);
    // Tell existing peers so WebRTC mesh can connect to the newcomer.
    socket.to(room.code).emit('peerJoined', { id: socket.id });
  });

  // ---- Host: beat & round configuration ----
  socket.on('addBeat', (payload: AddBeatPayload, ack: Ack<{ beatId: string }>) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    const videoId = parseYouTubeId(payload?.url ?? '');
    if (!videoId) {
      ack?.({ ok: false, error: 'That does not look like a valid YouTube link.' });
      return;
    }
    const label = (payload?.label ?? '').trim().slice(0, 40) || `Beat ${room.beats.length + 1}`;
    const beat = store.addBeat(room, videoId, label, socket.id);
    ack?.({ ok: true, beatId: beat.id });
    broadcast(room);
  });

  socket.on('removeBeat', (payload: RemoveBeatPayload, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    store.removeBeat(room, payload?.beatId);
    ack?.({ ok: true });
    broadcast(room);
  });

  socket.on('selectBeat', (payload: SelectBeatPayload, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    if (room.beats.some((b) => b.id === payload?.beatId)) {
      room.activeBeatId = payload.beatId;
      broadcast(room);
    }
    ack?.({ ok: true });
  });

  socket.on('setRoundLength', (payload: SetRoundLengthPayload, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    if (ALLOWED_ROUND_LENGTHS.includes(payload?.seconds)) {
      room.roundLength = payload.seconds;
      broadcast(room);
    }
    ack?.({ ok: true });
  });

  socket.on('startBattle', (_payload: unknown, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    const { error } = store.startBattle(room, broadcastAll);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('submitRating', (payload: SubmitRatingPayload, ack: Ack) => {
    const room = store.getRoomBySocket(socket.id);
    if (!room) {
      ack?.({ ok: false, error: 'You are not in a room.' });
      return;
    }
    const { error } = store.submitRating(room, socket.id, payload?.ratings ?? {}, broadcastAll);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('nextRound', (_payload: unknown, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    // Rotate to the next beat in the crate so each round gets a fresh one
    // (wraps around if at the end). Host can still hand-pick from the lobby.
    store.rotateActiveBeat(room);
    const { error } = store.startBattle(room, broadcastAll);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('returnToLobby', (_payload: unknown, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    store.returnToLobby(room);
    broadcastAll(room);
    ack?.({ ok: true });
  });

  // ---- WebRTC signaling relay (Phase 2) ----
  socket.on('rtcOffer', (p: RtcSignalPayload) => relaySignal(socket.id, 'rtcOffer', p));
  socket.on('rtcAnswer', (p: RtcSignalPayload) => relaySignal(socket.id, 'rtcAnswer', p));
  socket.on('rtcIce', (p: RtcSignalPayload) => relaySignal(socket.id, 'rtcIce', p));

  // ---- Disconnect / leave ----
  socket.on('leaveLobby', () => handleLeave(socket.id));
  socket.on('disconnect', () => handleLeave(socket.id));
});

function relaySignal(from: string, event: string, payload: RtcSignalPayload) {
  if (!payload?.to) return;
  io.to(payload.to).emit(event, { ...payload, from });
}

function handleLeave(socketId: string) {
  const roomBefore = store.getRoomBySocket(socketId);
  const code = roomBefore?.code;
  const { room, deleted } = store.removePlayer(socketId);
  if (deleted || !room) {
    // Room may have been destroyed — refresh the public list either way.
    broadcastLobbyList();
    return;
  }
  // Let peers tear down their WebRTC connection to the departed player.
  if (code) io.to(code).emit('peerLeft', { id: socketId });
  broadcastAll(room);
}

// Helper: resolve the caller's room and confirm they are the host.
function requireHost(socketId: string, ack?: Ack): Room | null {
  const room = store.getRoomBySocket(socketId);
  if (!room) {
    ack?.({ ok: false, error: 'You are not in a room.' });
    return null;
  }
  if (room.hostId !== socketId) {
    ack?.({ ok: false, error: 'Only the host can do that.' });
    return null;
  }
  return room;
}

server.listen(PORT, () => {
  console.log(`🎤 Freestyle Battle server listening on :${PORT} (origin: ${CLIENT_ORIGIN})`);
});
