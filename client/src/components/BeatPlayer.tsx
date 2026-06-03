import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { loadYouTubeApi } from '../youtubeApi';

export interface BeatPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getTime: () => number;
  ready: () => boolean;
}

interface Props {
  videoId: string;
  onReady?: () => void;
  className?: string;
}

// A directly-controllable YouTube player. Parents drive it imperatively via the
// ref (play / pause / seek). Used to play the beat while an MC records, and to
// play the beat underneath a recorded take during rating.
const BeatPlayer = forwardRef<BeatPlayerHandle, Props>(function BeatPlayer(
  { videoId, onReady, className = '' },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);

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
          onReady: () => {
            setReady(true);
            onReady?.();
          },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the loaded video if the beat changes.
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

  useImperativeHandle(ref, () => ({
    play: () => {
      try {
        playerRef.current?.unMute();
        playerRef.current?.setVolume(100);
        playerRef.current?.playVideo();
      } catch {
        /* noop */
      }
    },
    pause: () => {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        /* noop */
      }
    },
    seekTo: (s: number) => {
      try {
        playerRef.current?.seekTo(Math.max(0, s), true);
      } catch {
        /* noop */
      }
    },
    getTime: () => {
      try {
        return playerRef.current?.getCurrentTime() ?? 0;
      } catch {
        return 0;
      }
    },
    ready: () => ready,
  }));

  return (
    <div className={`beat-player ${className}`}>
      <div className="beat-player__frame" ref={mountRef} />
    </div>
  );
});

export default BeatPlayer;
