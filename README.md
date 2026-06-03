# 🎤 FREESTYLE BATTLE

A real-time multiplayer web game. Friends join an online lobby, **the same beat
drops in sync for everyone**, each player freestyle-raps over it on a live mic,
and afterward everyone rates each other 1–10. A round winner gets crowned and a
cumulative leaderboard tracks the whole session.

- **Same beat, perfectly synced** across every player (server-authoritative
  timestamp + drift correction).
- **Live voice** over WebRTC mesh — you hear everyone rap in real time.
- **No database** — lobby state lives in memory, keyed by a 4-char room code.
- Dark, gritty battle-rap stage aesthetic.

---

## Stack

| Part      | Tech                                                              |
| --------- | ---------------------------------------------------------------- |
| Client    | React + Vite + TypeScript, plain CSS                             |
| Server    | Node + Express + Socket.IO (real-time, in-memory state)          |
| Voice     | WebRTC full mesh (peer-to-peer audio), Socket.IO for signaling   |
| Beats     | Embedded YouTube via the IFrame Player API                       |

Monorepo layout:

```
freestyle-battle/
├── client/      # React app (the game UI)
├── server/      # Socket.IO game server (source of truth)
└── package.json # convenience scripts to run both
```

---

## Prerequisites

- **Node.js 18+** (this was built and tested on Node 26). Get it from
  <https://nodejs.org> or `brew install node`.

---

## Run it locally (quick start)

From the project root:

```bash
npm install     # installs root + client + server deps
npm run dev     # starts BOTH the server and client together
```

Then open **http://localhost:5173**.

- Client (the game): http://localhost:5173
- Server (game backend): http://localhost:3001

To play with yourself while testing, open the URL in **two browser tabs/windows**
(or two different browsers): Create a lobby in one, copy the 4-char code, and Join
from the other.

### Prefer two terminals?

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

---

## How to play

1. **Home** — type a handle, then **Create** a lobby or **Join** one. When
   creating, toggle **List publicly**: public lobbies appear in the **Public
   Battles** browser on the home screen for anyone to join; private lobbies are
   code-only. The 4-char code always works for either. The host can flip a lobby
   between public/private at any time from the lobby.
2. **Lobby** — the host pastes YouTube beat links (any normal YouTube URL works),
   labels them, picks the active beat, and sets the round length (30/60/90/120s).
   Everyone sees the player list with live indicators. Host hits **Start the
   Battle**.
3. **Countdown** — a synced 5-second "BEAT DROPS IN…" countdown for everyone.
4. **Battle** — the beat plays **in sync** for all players, a big timer counts
   down, and everyone's mic is live so you hear each other freestyle.
5. **Rating** — when the timer ends, score every *other* player 1–10 (you can't
   rate yourself).
6. **Results** — averaged scores, the round winner crowned 👑, and a cumulative
   leaderboard. The host starts the **Next Round** (auto-rotates to the next beat)
   or heads **Back to Lobby**.

The **host** runs the room. If the host leaves, host automatically migrates to the
next player. If everyone leaves, the room is discarded.

---

## Microphone & HTTPS (important for voice)

Browsers only allow microphone access on **`localhost` or over HTTPS**.

- Testing on the same machine via `localhost` → mic works.
- For friends to join from **other devices with working voice**, you need to
  **deploy** (the deployed client will be HTTPS). Opening the app over a plain
  `http://<your-lan-ip>` address on another device will block the mic.

If the mic is blocked or unavailable, the game still works fully — the voice bar
just shows a notice, and players can hop on a separate call (Discord, etc.).

YouTube also blocks autoplay-with-sound without a user gesture; if a client's beat
doesn't start, a **"TAP TO DROP THE BEAT"** button appears — tap it once.

---

## Deployment

> ⚠️ The server keeps **persistent WebSocket** connections and **in-memory
> state**, so it must run on a host that supports long-lived processes —
> **Railway, Render, or Fly.io**. It will **not** work on serverless platforms
> (Vercel/Netlify Functions, Lambda, Cloudflare Workers), which kill the socket
> between requests.

### 1. Deploy the **server** (Railway / Render / Fly)

Point the platform at the `server/` directory with:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start` (runs `node dist/index.js`)
- **Environment variables:**
  - `PORT` — usually injected automatically by the host.
  - `CLIENT_ORIGIN` — your deployed client URL, e.g.
    `https://freestyle-battle.vercel.app` (for CORS). `*` works but is less
    secure.

A `Procfile` (`web: node dist/index.js`) is included for platforms that use it.

Note the resulting server URL, e.g. `https://freestyle-battle-server.up.railway.app`.

### 2. Deploy the **client** (Netlify or Vercel)

On **Netlify** (a `client/netlify.toml` + `client/public/_redirects` are included):

1. New site → connect your repo.
2. **Base directory:** `client`
3. **Build command:** `npm run build` · **Publish directory:** `client/dist`
   (Netlify reads these from `netlify.toml` automatically if base is `client`).
4. **Site settings → Environment variables:** add
   `VITE_SERVER_URL` = your server URL from step 1
   (e.g. `https://freestyle-battle-server.up.railway.app`).
5. **Trigger a redeploy** after setting the env var — Vite bakes it in at build
   time, so it must be set *before* the build that goes live.

(On Vercel it's the same idea: root directory `client`, build `npm run build`,
output `dist`, env var `VITE_SERVER_URL`.)

Done — share the client URL and battle. The `_redirects` file makes deep links
work (SPA fallback).

---

## Environment variables

| Where    | Variable          | Purpose                                              | Default                 |
| -------- | ----------------- | ---------------------------------------------------- | ----------------------- |
| server   | `PORT`            | Port the server listens on                           | `3001`                  |
| server   | `CLIENT_ORIGIN`   | Allowed CORS origin for the client                   | `*`                     |
| client   | `VITE_SERVER_URL` | URL the client uses to reach the server              | `http://localhost:3001` |

Copy `server/.env.example` → `server/.env` and `client/.env.example` →
`client/.env` to set these locally.

---

## Architecture notes

The **server is the single source of truth** for lobby state, phase, the active
beat, and round timing. Clients react to server broadcasts — they never drive the
phase themselves.

**Phases:** `lobby → countdown → battle → rating → results → (loop)`

### Beat sync

On `startBattle` the server picks one authoritative `roundStartTimestamp` (the
moment the beat drops) and broadcasts it. Each client:

1. measures its clock offset vs. the server (a small NTP-style ping), then
2. seeks its YouTube player to `(serverNow − roundStartTimestamp)` and
3. self-corrects whenever drift exceeds ~1.5s.

So everyone hears the same instant of the beat, not just "play on cue."

### Socket.IO events

**Client → Server:** `createLobby` (with `isPublic`), `joinLobby`, `addBeat`,
`removeBeat`, `selectBeat`, `setRoundLength`, `setPublic`, `startBattle`,
`submitRating`, `nextRound`, `returnToLobby`, `leaveLobby`, `timesync`,
`watchLobbies` / `unwatchLobbies` (subscribe to the public lobby list)
WebRTC signaling: `rtcOffer`, `rtcAnswer`, `rtcIce`

**Server → Client:** `roomState` (the full authoritative snapshot — drives every
screen), `publicLobbies` (the live browsable list), `peerJoined`, `peerLeft`
WebRTC signaling relay: `rtcOffer`, `rtcAnswer`, `rtcIce`

### Voice (WebRTC mesh)

On entering a lobby the client requests the mic and opens a peer connection to
every other player (full mesh; fine for ≤8 players). It uses the "perfect
negotiation" pattern so any pair connects without glare, with Socket.IO relaying
SDP/ICE. Each player can mute/unmute, and an audio-level meter shows who's
currently talking. Beat audio (YouTube) is completely separate from voice.

---

## Troubleshooting

- **"Connecting to the stage…" never clears** → the server isn't running or
  `VITE_SERVER_URL` is wrong. Start the server / fix the env var.
- **Beat won't play** → tap the "TAP TO DROP THE BEAT" button (browser autoplay
  gate).
- **No voice / "Mic blocked"** → you're not on `localhost`/HTTPS, or you denied
  the mic permission. Deploy for HTTPS, or allow the mic.
- **Friends can't hear each other on the same Wi-Fi via a LAN IP** → mic needs
  HTTPS; deploy the app (see Deployment).
- **Beats slightly out of sync** → they self-correct within ~1.5s; a quick page
  refresh re-syncs immediately.

---

Built end-to-end in phases: ① synced lobby/beat/rating/leaderboard,
② WebRTC live voice, ③ polish + host migration + deploy config.
