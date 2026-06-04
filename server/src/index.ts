import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { isGenre } from './beats.js';
import { Store, type Room, type RoundCallbacks } from './store.js';
import type {
  Ack,
  CreateLobbyPayload,
  JoinLobbyPayload,
  SelectGenrePayload,
  SetPublicPayload,
  SetRoundLengthPayload,
  SubmitRatingPayload,
  SubmitRecordingPayload,
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
  // Recorded takes are sent as binary; allow generous payloads (up to ~120s clips).
  maxHttpBufferSize: 15_000_000,
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

// A game room changed AND the public list may have too (player count / phase).
function broadcastAll(room: Room) {
  broadcast(room);
  broadcastLobbyList();
}

// Ship the round's recorded takes (binary audio) to everyone in the room.
function sendRecordings(room: Room) {
  io.to(room.code).emit('recordings', {
    roundNumber: room.roundNumber,
    recordings: store.roundRecordings(room),
  });
}

// Callbacks the round engine uses to push updates out.
const roundCb: RoundCallbacks = { broadcast: broadcastAll, recordings: sendRecordings };

io.on('connection', (socket) => {
  // Lightweight clock-sync endpoint (client measures RTT to align timestamps).
  socket.on('timesync', (_clientSent: number, ack: (serverTime: number) => void) => {
    if (typeof ack === 'function') ack(Date.now());
  });

  // Home-screen clients subscribe here to receive the live public lobby list.
  socket.on('watchLobbies', () => {
    socket.join(HOME_ROOM);
    socket.emit('publicLobbies', store.publicLobbies());
  });
  socket.on('unwatchLobbies', () => socket.leave(HOME_ROOM));

  socket.on('createLobby', (payload: CreateLobbyPayload, ack: Ack<{ code: string; you: string }>) => {
    const room = store.createRoom(socket.id, payload?.handle ?? '', !!payload?.isPublic);
    socket.join(room.code);
    socket.leave(HOME_ROOM);
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
  });

  // ---- Host: genre & round configuration ----
  socket.on('selectGenre', (payload: SelectGenrePayload, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    if (isGenre(payload?.genre)) {
      store.setGenre(room, payload.genre);
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
    const { error } = store.startBattle(room, roundCb);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  // The current performer uploads their recorded take (binary audio).
  socket.on('submitRecording', (payload: SubmitRecordingPayload, ack: Ack) => {
    const room = store.getRoomBySocket(socket.id);
    if (!room) {
      ack?.({ ok: false, error: 'You are not in a room.' });
      return;
    }
    const raw = payload?.data as ArrayBuffer | Buffer | undefined;
    if (!raw) {
      ack?.({ ok: false, error: 'No audio received.' });
      return;
    }
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    const rec = {
      beatOffset: Number(payload?.beatOffset) || 0,
      mimeType: String(payload?.mimeType || 'audio/webm'),
      data,
    };
    const { error } = store.submitRecording(room, socket.id, rec, roundCb);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('submitRating', (payload: SubmitRatingPayload, ack: Ack) => {
    const room = store.getRoomBySocket(socket.id);
    if (!room) {
      ack?.({ ok: false, error: 'You are not in a room.' });
      return;
    }
    const { error } = store.submitRating(room, socket.id, payload?.ratings ?? {}, roundCb);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('nextRound', (_payload: unknown, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    // startBattle rolls a fresh random beat from the genre for the new round.
    const { error } = store.startBattle(room, roundCb);
    ack?.(error ? { ok: false, error } : { ok: true });
  });

  socket.on('returnToLobby', (_payload: unknown, ack: Ack) => {
    const room = requireHost(socket.id, ack);
    if (!room) return;
    store.returnToLobby(room);
    broadcastAll(room);
    ack?.({ ok: true });
  });

  // ---- Disconnect / leave ----
  socket.on('leaveLobby', () => handleLeave(socket.id));
  socket.on('disconnect', () => handleLeave(socket.id));
});

function handleLeave(socketId: string) {
  const { room, deleted } = store.removePlayer(socketId);
  if (deleted || !room) {
    broadcastLobbyList(); // room may be gone; refresh the public list
    return;
  }
  broadcastAll(room);
  // A leaver may have been the last MC we were waiting on to finish recording.
  store.recheckPerforming(room, roundCb);
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
