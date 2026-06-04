import { useEffect, useMemo, useRef, useState } from 'react';
import Equalizer from '../components/Equalizer';
import { getCtx, loadBeat, playBeatLoop, unlockAudio, type BeatPlayback } from '../audio';
import { getBeat } from '../beats';
import type { RecordingsPayload, RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
  recordings: RecordingsPayload | null;
}

const BEAT_VOLUME = 0.25; // beat ducked low under the vocal
const VOCAL_GAIN = 2.0; // boost the recorded vocal above 100%

export default function Rating({ room, you, actions, recordings }: Props) {
  const haveTakes = recordings && recordings.roundNumber === room.roundNumber;
  const beat = getBeat(room.activeBeatId);
  const audioRef = useRef<HTMLAudioElement>(null);
  const beatBufferRef = useRef<AudioBuffer | null>(null);
  const beatPlayRef = useRef<BeatPlayback | null>(null);
  const vocalChainRef = useRef<{ gain: GainNode } | null>(null);
  const [beatReady, setBeatReady] = useState(false);

  // Route the vocal <audio> through a Web Audio gain so we can boost it past
  // 100% (an <audio> element alone caps at 1.0). Created once, after the
  // AudioContext is unlocked by the user's "play" tap.
  const ensureVocalChain = () => {
    if (vocalChainRef.current || !audioRef.current) return;
    try {
      const ctx = getCtx();
      const src = ctx.createMediaElementSource(audioRef.current);
      const gain = ctx.createGain();
      gain.gain.value = VOCAL_GAIN;
      src.connect(gain);
      gain.connect(ctx.destination);
      vocalChainRef.current = { gain };
    } catch {
      /* already connected, or unsupported — vocal still plays at 1.0 */
    }
  };

  const allTakes = useMemo(() => (haveTakes ? recordings!.recordings : []), [haveTakes, recordings]);
  const scoreTargets = useMemo(() => allTakes.filter((t) => t.performerId !== you), [allTakes, you]);

  const urls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of allTakes) map[r.performerId] = URL.createObjectURL(new Blob([r.data], { type: r.mimeType }));
    return map;
  }, [allTakes]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  // Preload the beat buffer.
  useEffect(() => {
    if (!beat) {
      setBeatReady(true);
      return;
    }
    let cancelled = false;
    loadBeat(beat.file)
      .then((buf) => {
        if (!cancelled) {
          beatBufferRef.current = buf;
          setBeatReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setBeatReady(true); // continue without beat rather than block
      });
    return () => {
      cancelled = true;
    };
  }, [beat?.file]);

  const [mode, setMode] = useState<'showcase' | 'score'>('showcase');
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const startedRef = useRef(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(room.ratingsSubmitted.includes(you));
  const [busy, setBusy] = useState(false);

  const stopBeat = () => {
    beatPlayRef.current?.stop();
    beatPlayRef.current = null;
  };

  // Showcase engine: play each take once (beat looping under it), then advance.
  const playFrom = (i: number) => {
    const t = allTakes[i];
    const audio = audioRef.current;
    if (!t || !audio) {
      try {
        audio?.pause();
      } catch {
        /* noop */
      }
      stopBeat();
      setMode('score');
      return;
    }
    setIdx(i);

    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      clearTimeout(timer);
      stopBeat();
      playFrom(i + 1);
    };

    audio.onended = advance;
    audio.onerror = advance;
    audio.src = urls[t.performerId];
    audio.volume = 1;
    audio.currentTime = 0;

    // Restart the beat from 0 under this take, ducked low.
    stopBeat();
    if (beatBufferRef.current) beatPlayRef.current = playBeatLoop(beatBufferRef.current, BEAT_VOLUME);

    const timer = window.setTimeout(advance, (room.roundLength + 12) * 1000);
    audio
      .play()
      .then(() => setNeedsTap(false))
      .catch(() => {
        // Autoplay blocked (rare here, since they just recorded) — show a
        // one-tap fallback. The safety timer still advances either way.
        setNeedsTap(true);
      });
  };

  const beginShowcase = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    await unlockAudio(); // resume the AudioContext (already unlocked from recording)
    ensureVocalChain(); // wire the vocal boost
    setStarted(true);
    playFrom(0);
  };

  // Auto-start the showcase the instant the takes + beat are ready.
  useEffect(() => {
    if (mode === 'showcase' && haveTakes && allTakes.length > 0 && beatReady && !startedRef.current) {
      void beginShowcase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, haveTakes, allTakes.length, beatReady]);

  // Fallback: if a browser ever blocks autoplay, one tap re-attempts.
  const tapToPlay = async () => {
    setNeedsTap(false);
    await unlockAudio();
    ensureVocalChain();
    playFrom(idx);
  };

  useEffect(() => {
    if (haveTakes && allTakes.length === 0) setMode('score');
  }, [haveTakes, allTakes.length]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      stopBeat();
    },
    [],
  );

  const submit = async () => {
    setBusy(true);
    const res = await actions.submitRating(scores);
    setBusy(false);
    if (res.ok) setSubmitted(true);
  };

  const waitingOn = room.players.filter((p) => p.online && !room.ratingsSubmitted.includes(p.id));
  const allScored = scoreTargets.every((t) => scores[t.performerId] != null);

  if (!haveTakes) {
    return (
      <div className="rating">
        <h1 className="rating__title">THE REVIEW</h1>
        <p className="muted">Loading the takes…</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rating rating--done">
        <h1 className="rating__title">SCORES LOCKED</h1>
        <p className="muted">Waiting on {waitingOn.length} more…</p>
        <ul className="waiting">
          {room.players.map((p) => (
            <li key={p.id} className="waiting__row">
              <span className={`dot ${room.ratingsSubmitted.includes(p.id) ? 'dot--live' : 'dot--off'}`} />
              {p.handle}
              <span className="muted">{room.ratingsSubmitted.includes(p.id) ? 'rated' : '…'}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ---- Showcase ----
  if (mode === 'showcase' && allTakes.length > 0) {
    const current = allTakes[idx];
    const isOwn = current?.performerId === you;
    return (
      <div className="rating showcase">
        <p className="showcase__tag">
          {started ? `NOW PLAYING · ${idx + 1} OF ${allTakes.length}` : 'THE REVIEW'}
        </p>
        <h1 className="performing__name">
          {started ? current?.handle : 'Loading takes…'}
          {started && isOwn && <span className="badge badge--you">YOU</span>}
        </h1>
        <Equalizer bars={15} className="showcase__eq" />
        <p className="battle__beatlabel">over: {beat?.title ?? 'beat'}</p>

        {needsTap ? (
          <button className="btn btn--hot btn--big" onClick={() => void tapToPlay()}>
            ▶ TAP TO PLAY
          </button>
        ) : (
          <>
            <p className="muted showcase__hint">Every take plays once, then you’ll score them.</p>
            <ul className="showcase__dots">
              {allTakes.map((t, i) => (
                <li
                  key={t.performerId}
                  className={`showcase__dot ${i < idx ? 'is-done' : ''} ${i === idx ? 'is-now' : ''}`}
                />
              ))}
            </ul>
          </>
        )}
        <audio ref={audioRef} />
      </div>
    );
  }

  // ---- Score ----
  if (scoreTargets.length === 0) {
    return (
      <div className="rating">
        <h1 className="rating__title">THE REVIEW</h1>
        <p className="muted">You were the only MC this round. On to the standings…</p>
        <button className="btn btn--hot" disabled={busy} onClick={submit}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="rating">
      <h1 className="rating__title">SCORE THE BARS</h1>
      <p className="muted">You heard everyone — now score each MC 1–10.</p>

      <div className="rating__list">
        {scoreTargets.map((t) => (
          <div key={t.performerId} className="ratecard">
            <span className="ratecard__name">{t.handle}</span>
            <div className="ratecard__scores">
              {Array.from({ length: 10 }).map((_, i) => {
                const val = i + 1;
                const on = scores[t.performerId] === val;
                return (
                  <button
                    key={val}
                    className={`scorebtn ${on ? 'scorebtn--on' : ''}`}
                    onClick={() => setScores((s) => ({ ...s, [t.performerId]: val }))}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn--hot btn--big" disabled={!allScored || busy} onClick={submit}>
        {allScored ? 'LOCK IN SCORES' : 'Score everyone first'}
      </button>
    </div>
  );
}
