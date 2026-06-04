import { useEffect, useMemo, useRef, useState } from 'react';
import BeatPlayer, { type BeatPlayerHandle } from '../components/BeatPlayer';
import Equalizer from '../components/Equalizer';
import type { RecordingsPayload, RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
  recordings: RecordingsPayload | null;
}

const BEAT_VOLUME = 18; // duck the beat low under the vocal

export default function Rating({ room, you, actions, recordings }: Props) {
  const haveTakes = recordings && recordings.roundNumber === room.roundNumber;
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const beatRef = useRef<BeatPlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Every take, in recorded order — the whole showcase plays through these.
  const allTakes = useMemo(
    () => (haveTakes ? recordings!.recordings : []),
    [haveTakes, recordings],
  );
  // You score everyone except yourself.
  const scoreTargets = useMemo(() => allTakes.filter((t) => t.performerId !== you), [allTakes, you]);

  const urls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of allTakes) map[r.performerId] = URL.createObjectURL(new Blob([r.data], { type: r.mimeType }));
    return map;
  }, [allTakes]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const [mode, setMode] = useState<'showcase' | 'score'>('showcase');
  const [idx, setIdx] = useState(0);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(room.ratingsSubmitted.includes(you));
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

  // ---- Showcase playback engine: play each take once, then auto-advance ----
  const playFrom = (i: number) => {
    const t = allTakes[i];
    const audio = audioRef.current;
    if (!t || !audio) {
      // Reached the end → go to scoring.
      try {
        audio?.pause();
      } catch {
        /* noop */
      }
      beatRef.current?.pause();
      setMode('score');
      return;
    }
    setIdx(i);

    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      clearTimeout(timer);
      beatRef.current?.pause();
      playFrom(i + 1);
    };

    audio.onended = advance;
    audio.onerror = advance;
    audio.src = urls[t.performerId];
    audio.volume = 1;
    audio.currentTime = 0;

    beatRef.current?.seekTo(t.beatOffset);
    beatRef.current?.play();
    beatRef.current?.setVolume(BEAT_VOLUME);

    // Safety net in case 'ended' never fires (corrupt clip etc.).
    const timer = window.setTimeout(advance, (room.roundLength + 12) * 1000);

    const p = audio.play();
    if (p) {
      p.then(() => setNeedsGesture(false)).catch(() => {
        // Browser blocked autoplay — wait for one tap.
        clearTimeout(timer);
        audio.onended = null;
        audio.onerror = null;
        setNeedsGesture(true);
      });
    }
  };

  // Kick off the showcase when takes arrive.
  useEffect(() => {
    if (!haveTakes || startedRef.current) return;
    if (allTakes.length === 0) {
      setMode('score');
      return;
    }
    startedRef.current = true;
    playFrom(0);
    return () => {
      audioRef.current?.pause();
      beatRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haveTakes]);

  const submit = async () => {
    setBusy(true);
    const res = await actions.submitRating(scores);
    setBusy(false);
    if (res.ok) setSubmitted(true);
  };

  const waitingOn = room.players.filter((p) => p.online && !room.ratingsSubmitted.includes(p.id));
  const allScored = scoreTargets.every((t) => scores[t.performerId] != null);

  // ---- Loading ----
  if (!haveTakes) {
    return (
      <div className="rating">
        <h1 className="rating__title">THE REVIEW</h1>
        <p className="muted">Loading the takes…</p>
      </div>
    );
  }

  // ---- Submitted: waiting for others ----
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

  // ---- Showcase: takes auto-play one after another ----
  if (mode === 'showcase') {
    const current = allTakes[idx];
    const isOwn = current?.performerId === you;
    return (
      <div className="rating showcase">
        <p className="showcase__tag">
          NOW PLAYING · {idx + 1} OF {allTakes.length}
        </p>
        <h1 className="performing__name">
          {current?.handle}
          {isOwn && <span className="badge badge--you">YOU</span>}
        </h1>
        <Equalizer bars={15} className="showcase__eq" />

        <div className="rating__stage">
          {beat && (
            <BeatPlayer ref={beatRef} videoId={beat.videoId} className="beat-player--mini" volume={BEAT_VOLUME} />
          )}
          <audio ref={audioRef} />
        </div>
        <p className="battle__beatlabel">over: {beat?.label}</p>

        {needsGesture ? (
          <button className="btn btn--hot btn--big" onClick={() => playFrom(idx)}>
            ▶ PLAY THE TAKES
          </button>
        ) : (
          <p className="muted showcase__hint">
            Sit back — every take plays once, then you’ll score them.
          </p>
        )}

        {/* progress dots */}
        <ul className="showcase__dots">
          {allTakes.map((t, i) => (
            <li key={t.performerId} className={`showcase__dot ${i < idx ? 'is-done' : ''} ${i === idx ? 'is-now' : ''}`} />
          ))}
        </ul>
      </div>
    );
  }

  // ---- Score: rate each MC 1–10 ----
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
