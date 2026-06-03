import { io, type Socket } from 'socket.io-client';

// Server URL: set VITE_SERVER_URL in production (e.g. your Railway URL).
// Falls back to the dev server on localhost:3001.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

// ---- Clock synchronization ----
// We measure the offset between this client's clock and the server's so that
// the authoritative `roundStartTimestamp` can be compared against our own
// Date.now(). Uses the lowest-RTT sample of several pings (NTP-style).
let clockOffset = 0; // serverTime ≈ Date.now() + clockOffset

export function getServerNow(): number {
  return Date.now() + clockOffset;
}

export function getClockOffset(): number {
  return clockOffset;
}

async function pingOnce(): Promise<{ offset: number; rtt: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    socket.emit('timesync', t0, (serverTime: number) => {
      const t1 = Date.now();
      const rtt = t1 - t0;
      // Assume symmetric latency: server's "now" maps to our midpoint.
      const offset = serverTime + rtt / 2 - t1;
      resolve({ offset, rtt });
    });
  });
}

export async function syncClock(samples = 5): Promise<number> {
  const results: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < samples; i++) {
    try {
      results.push(await pingOnce());
    } catch {
      /* ignore individual failures */
    }
  }
  if (results.length) {
    results.sort((a, b) => a.rtt - b.rtt);
    clockOffset = results[0].offset; // lowest-RTT sample is the most trustworthy
  }
  return clockOffset;
}

// Re-sync whenever we (re)connect.
socket.on('connect', () => {
  void syncClock();
});
