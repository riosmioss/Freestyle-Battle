# 🎤 FREESTYLE BATTLE

A real-time multiplayer web game. Friends join an online lobby and battle
**turn by turn**: the beat plays, each MC raps their verse solo while it records,
then everyone listens back to each take (with the beat under it) and scores it
1–10. A round winner gets crowned and a cumulative leaderboard tracks the whole
session. You can download every take afterward.

- **Curated beat library** — host picks a genre (Hip Hop / Trap); the server
  rolls a random MP3 beat from it each round. Beats are bundled static assets
  (no YouTube, no copyright friction).
- **Everyone records at once** — the beat loops and every MC records their verse
  simultaneously over a shared timer.
- **Listen-back rating** — every take auto-plays in a showcase with the beat
  ducked underneath, then you score each MC 1–10. Can't rate yourself.
- **Download mixed clips** — each take is rendered as a **vocal + beat** WAV you
  can share.
- **No database** — lobby state lives in memory, keyed by a 4-char room code.
- **Public or private lobbies** — list a room publicly or keep it code-only.
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
2. **Lobby** — the host picks a **genre** (Hip Hop / Trap) and the round length
   (30/60/90/120s); the server rolls a random beat from that genre each round.
   Everyone sees the player list with live indicators. Host hits **Start the
   Battle**.
3. **Record** — a 5-second "beat drops in" countdown, then the beat plays and
   **everyone records their verse at the same time** over one shared timer. When
   the timer hits zero, each take uploads automatically.
   *(Headphones recommended so the beat doesn't bleed into the recording.)*
4. **Rating** — listen back to each take one at a time (the beat is ducked low
   under the boosted vocal so the rap is clear), then score it 1–10. You can't
   rate your own take.
5. **Results** — averaged scores, the round winner crowned 👑, a cumulative
   leaderboard, and **download buttons** for every take. The host starts the
   **Next Round** (auto-rotates to the next beat) or heads **Back to Lobby**.

The **host** runs the room. If the host leaves, host automatically migrates to the
next player. If everyone leaves, the room is discarded.

---

## Microphone & HTTPS (important for recording)

Browsers only allow microphone access on **`localhost` or over HTTPS**.

- Testing on the same machine via `localhost` → mic works (click **Allow** when
  prompted).
- For friends to join from **other devices and record**, you need to **deploy**
  (the deployed client will be HTTPS). Opening the app over a plain
  `http://<your-lan-ip>` address on another device will block the mic.

If the mic is blocked or unavailable, the game still runs — that player just
can't record a take that round.

YouTube also blocks autoplay-with-sound without a user gesture; if the beat
doesn't start on your turn, a **"Tap to start it"** button is right there.

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

**Phases:** `lobby → countdown → performing → (repeat per MC) → rating → results → (loop)`

### Turn engine & recording

On `startBattle` the server builds a `turnOrder` of the online players and runs
each MC's turn back-to-back: a 5s countdown, then a `performing` window of
`roundLength` seconds. The performing client records its mic with
`MediaRecorder`, plays the beat so the MC can rap to it, and on time-up uploads
the take (binary audio + the beat offset where the vocal began) via
`submitRecording`. The server stores takes in memory for the round and ships
them to everyone (`recordings`) when the rating phase begins. During rating each
client plays a take's vocal alongside the YouTube beat (seeked to that offset),
so it sounds like the full performance. Downloads are the **vocal take only** —
YouTube audio can't be bundled into a saved file.

### Socket.IO events

**Client → Server:** `createLobby` (with `isPublic`), `joinLobby`, `selectGenre`,
`setRoundLength`, `setPublic`, `startBattle`, `submitRecording`, `submitRating`,
`nextRound`, `returnToLobby`, `leaveLobby`, `timesync`,
`watchLobbies` / `unwatchLobbies` (subscribe to the public list)

**Beats:** bundled MP3s live in `client/public/beats/`; the manifest is
`client/src/beats.ts` (full metadata) mirrored by `server/src/beats.ts`
(id/genre/title for random selection). Playback + the download mix use the Web
Audio API (`client/src/audio.ts`, `client/src/mix.ts`).

**Server → Client:** `roomState` (the full authoritative snapshot — drives every
screen), `recordings` (the round's recorded takes, sent at rating),
`publicLobbies` (the live browsable list)

### Microphone

The mic is acquired once you're in a room and reused by the recorder on your
turn. It needs `localhost` or HTTPS (see below). If the mic is blocked the game
still runs — you just can't record a take that round.

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
