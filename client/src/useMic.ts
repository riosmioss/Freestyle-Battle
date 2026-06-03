import { useEffect, useRef, useState } from 'react';

export interface MicState {
  supported: boolean;
  stream: MediaStream | null;
  ready: boolean;
  error: string | null;
}

// Acquires the microphone once we're in a room. The stream is reused by the
// recorder when it's your turn to perform. (Mic needs localhost or HTTPS.)
export function useMic(enabled: boolean): MicState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [, force] = useState(0);

  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setReady(true);
        force((n) => n + 1);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.name === 'NotAllowedError'
              ? 'Mic blocked. Allow microphone access so you can record your verse.'
              : 'Could not access a microphone.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, supported]);

  // Stop the mic entirely when we leave the room.
  useEffect(() => {
    if (enabled) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
    setError(null);
  }, [enabled]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { supported, stream: streamRef.current, ready, error };
}

// Pick the best recording MIME type this browser supports.
export function pickRecordingMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder !== 'undefined') {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
  }
  return '';
}
