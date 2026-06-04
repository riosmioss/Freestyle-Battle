// Web Audio engine for the local MP3 beats. Handles a single shared
// AudioContext, decoding/caching beat buffers, and looped playback. (Web Audio
// rather than <audio> tags so we can also mix vocal+beat for downloads.)

let ctx: AudioContext | null = null;

export function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

// Browsers start an AudioContext "suspended" until a user gesture. Call this
// from a click/tap to unlock playback.
export async function unlockAudio(): Promise<void> {
  try {
    await getCtx().resume();
  } catch {
    /* noop */
  }
}

// Decode + cache a beat MP3 by URL.
const cache = new Map<string, Promise<AudioBuffer>>();
export function loadBeat(url: string): Promise<AudioBuffer> {
  if (!cache.has(url)) {
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`beat fetch failed (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => getCtx().decodeAudioData(buf));
    // Don't cache failures (so a missing file can succeed once uploaded).
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url)!;
}

export interface BeatPlayback {
  stop: () => void;
  setVolume: (v: number) => void; // 0..1
}

// Play a beat buffer on a loop at `volume` (0..1). Returns controls to stop it
// and change its volume live (for ducking under a vocal).
export function playBeatLoop(buffer: AudioBuffer, volume = 1): BeatPlayback {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = clamp01(volume);
  src.connect(gain);
  gain.connect(c.destination);
  try {
    src.start(0);
  } catch {
    /* noop */
  }
  return {
    stop: () => {
      try {
        src.stop();
      } catch {
        /* noop */
      }
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
    },
    setVolume: (v: number) => {
      gain.gain.value = clamp01(v);
    },
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
