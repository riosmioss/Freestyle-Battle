import { useEffect, useRef, useState } from 'react';
import { getServerNow } from '../socket';
import { loadYouTubeApi } from '../youtubeApi';

const DRIFT_THRESHOLD = 1.5; // seconds out-of-sync before we re-seek

interface Props {
  videoId: string;
  // Server-authoritative beat-drop moment (server epoch ms). The beat should be
  // at position (serverNow - roundStartTimestamp) for everyone, always.
  roundStartTimestamp: number;
  // Only actually plays while this is true (i.e. during the battle phase).
  active: boolean;
  // Visually hidden during rating/results but kept mounted so playback persists.
  hidden?: boolean;
}

// A YouTube player kept drift-corrected against a shared timestamp so every
// client hears the same instant of the beat. Falls back to a tap-to-play
// overlay when the browser blocks autoplay-with-sound.
export default function SyncedBeatPlayer({ videoId, roundStartTimestamp, active, hidden }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => setReady(true),
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
    };
    // Player is created once; videoId changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the loaded video if the active beat changes between rounds.
  useEffect(() => {
    if (ready && playerRef.current) {
      try {
        playerRef.current.loadVideoById(videoId);
        playerRef.current.pauseVideo();
      } catch {
        /* noop */
      }
    }
  }, [videoId, ready]);

  // Drive synced playback + drift correction while active.
  useEffect(() => {
    if (!ready || !playerRef.current) return;
    const player = playerRef.current;

    if (!active) {
      try {
        player.pauseVideo();
      } catch {
        /* noop */
      }
      return;
    }

    let raf = 0;
    let gestureTimer = 0;

    const expectedPos = () => (getServerNow() - roundStartTimestamp) / 1000;

    const start = () => {
      const pos = expectedPos();
      try {
        player.seekTo(Math.max(0, pos), true);
        player.unMute();
        player.setVolume(100);
        player.playVideo();
      } catch {
        /* noop */
      }
      // Detect blocked autoplay: if not playing shortly after, ask for a tap.
      gestureTimer = window.setTimeout(() => {
        try {
          const state = player.getPlayerState();
          const PLAYING = window.YT?.PlayerState.PLAYING ?? 1;
          const BUFFERING = window.YT?.PlayerState.BUFFERING ?? 3;
          if (state !== PLAYING && state !== BUFFERING) setNeedsGesture(true);
        } catch {
          setNeedsGesture(true);
        }
      }, 800);
    };

    start();

    // Continuous drift correction.
    let last = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 1000) {
        last = now;
        try {
          const expected = expectedPos();
          const actual = player.getCurrentTime();
          if (expected >= 0 && Math.abs(actual - expected) > DRIFT_THRESHOLD) {
            player.seekTo(expected, true);
          }
        } catch {
          /* noop */
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(gestureTimer);
    };
  }, [active, ready, roundStartTimestamp, videoId]);

  const handleTap = () => {
    setNeedsGesture(false);
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(Math.max(0, (getServerNow() - roundStartTimestamp) / 1000), true);
      player.unMute();
      player.setVolume(100);
      player.playVideo();
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`beat-player ${hidden ? 'beat-player--hidden' : ''}`}>
      <div className="beat-player__frame" ref={mountRef} />
      {needsGesture && active && (
        <button className="beat-player__gesture" onClick={handleTap}>
          <span className="beat-player__gesture-icon">▶</span>
          TAP TO DROP THE BEAT
        </button>
      )}
    </div>
  );
}
