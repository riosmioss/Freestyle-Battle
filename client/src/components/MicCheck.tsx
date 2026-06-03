import { useEffect, useRef, useState } from 'react';
import { pickRecordingMime, type MicState } from '../useMic';

interface Props {
  mic: MicState;
}

// A quick microphone test: a live input-level meter (watch it move when you
// talk) plus a 4-second record-and-play-back so you can hear yourself before
// it counts. Uses the same mic stream the recorder will use on your turn.
export default function MicCheck({ mic }: Props) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'playing'>('idle');
  const ctxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Live level meter while the panel is open.
  useEffect(() => {
    if (!open || !mic.stream) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctxRef.current = ctx;
    ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(mic.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 55) {
        last = t;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.4));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
    };
  }, [open, mic.stream]);

  const recordTest = () => {
    if (!mic.stream || phase !== 'idle') return;
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      const mime = pickRecordingMime();
      rec = mime ? new MediaRecorder(mic.stream, { mimeType: mime }) : new MediaRecorder(mic.stream);
    } catch {
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setPhase('playing');
      audio.onended = () => {
        setPhase('idle');
        URL.revokeObjectURL(url);
      };
      audio.play().catch(() => setPhase('idle'));
    };
    setPhase('recording');
    rec.start();
    window.setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, 4000);
  };

  const bars = 24;
  const lit = Math.round(level * bars);

  return (
    <section className="panel miccheck">
      <button className="miccheck__head" onClick={() => setOpen((o) => !o)}>
        <span className="panel__title miccheck__title">🎙 Mic Check</span>
        <span className="miccheck__toggle">{open ? 'Hide' : 'Test my mic'}</span>
      </button>

      {open &&
        (!mic.supported ? (
          <p className="error">Recording isn’t supported on this browser.</p>
        ) : mic.error ? (
          <p className="error">{mic.error}</p>
        ) : !mic.stream ? (
          <p className="muted">Connecting to your microphone…</p>
        ) : (
          <div className="miccheck__body">
            <p className="muted">Say something — the meter should jump.</p>
            <div className="meter" aria-hidden>
              {Array.from({ length: bars }).map((_, i) => (
                <span
                  key={i}
                  className={`meter__bar ${i < lit ? 'meter__bar--on' : ''} ${i > bars * 0.8 ? 'meter__bar--hot' : ''}`}
                />
              ))}
            </div>
            <button className="btn btn--ghost btn--sm" disabled={phase !== 'idle'} onClick={recordTest}>
              {phase === 'recording'
                ? '● Recording 4s…'
                : phase === 'playing'
                  ? '▶ Playing it back…'
                  : 'Record 4s & hear myself'}
            </button>
          </div>
        ))}
    </section>
  );
}
