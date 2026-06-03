import { useEffect, useMemo, useRef, useState } from 'react';
import BeatPlayer, { type BeatPlayerHandle } from '../components/BeatPlayer';
import type { RecordingsPayload, RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
  recordings: RecordingsPayload | null;
}

export default function Rating({ room, you, actions, recordings }: Props) {
  const haveTakes = recordings && recordings.roundNumber === room.roundNumber;
  const beat = room.beats.find((b) => b.id === room.activeBeatId);
  const beatRef = useRef<BeatPlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Mix: keep the recorded vocal at full volume and duck the beat low under it
  // so the rap is clearly audible. (Direct element playback = always reliable.)
  const BEAT_VOLUME = 18; // out of 100

  // All takes, others first and your OWN take last (so you can listen back to
  // what you made — you just can't score yourself).
  const takes = useMemo(() => {
    if (!haveTakes) return [];
    const all = recordings!.recordings;
    const others = all.filter((r) => r.performerId !== you);
    const mine = all.filter((r) => r.performerId === you);
    return [...others, ...mine];
  }, [haveTakes, recordings, you]);

  // Build playable object URLs for each take.
  const urls = useMemo(() => {
    const map: Record<string, string> = {};
    if (haveTakes) {
      for (const r of recordings!.recordings) {
        map[r.performerId] = URL.createObjectURL(new Blob([r.data], { type: r.mimeType }));
      }
    }
    return map;
  }, [haveTakes, recordings]);

  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(room.ratingsSubmitted.includes(you));
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = takes[idx];
  const isMine = !!current && current.performerId === you;
  // You only need to score everyone else; your own take is listen-only.
  const allScored = takes.filter((t) => t.performerId !== you).every((t) => scores[t.performerId] != null);
  const waitingOn = room.players.filter((p) => p.online && !room.ratingsSubmitted.includes(p.id));

  const stop = () => {
    audioRef.current?.pause();
    beatRef.current?.pause();
    setPlaying(false);
  };

  const play = () => {
    if (!current) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = urls[current.performerId];
    audio.volume = 1; // recorded vocal at full
    audio.currentTime = 0;
    // Beat plays underneath, ducked low so the rap sits on top.
    beatRef.current?.seekTo(current.beatOffset);
    beatRef.current?.play();
    beatRef.current?.setVolume(BEAT_VOLUME);
    audio.play().catch(() => {});
    setPlaying(true);
    audio.onended = () => {
      beatRef.current?.pause();
      setPlaying(false);
    };
  };

  const submit = async () => {
    stop();
    setBusy(true);
    const res = await actions.submitRating(scores);
    setBusy(false);
    if (res.ok) setSubmitted(true);
  };

  // Loading takes from the server.
  if (!haveTakes) {
    return (
      <div className="rating">
        <h1 className="rating__title">RATE THE BARS</h1>
        <p className="muted">Loading the takes…</p>
      </div>
    );
  }

  // Nobody recorded anything this round.
  if (recordings!.recordings.length === 0 && !submitted) {
    return (
      <div className="rating">
        <h1 className="rating__title">RATE THE BARS</h1>
        <p className="muted">No takes were recorded this round. Waiting for results…</p>
        <button className="btn btn--hot" disabled={busy} onClick={submit}>
          Continue
        </button>
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

  return (
    <div className="rating">
      <h1 className="rating__title">RATE THE BARS</h1>
      <p className="muted">
        {isMine
          ? '🎤 Your take — listen back to what you made'
          : `Take ${idx + 1} of ${takes.length} · listen, then score 1–10`}
      </p>

      {/* Hidden beat player + recorded vocal, played together */}
      <div className="rating__stage">
        {beat && (
          <BeatPlayer ref={beatRef} videoId={beat.videoId} className="beat-player--mini" volume={BEAT_VOLUME} />
        )}
        <audio ref={audioRef} />
      </div>
      <p className="battle__beatlabel">over: {beat?.label}</p>

      <div className="ratecard ratecard--solo">
        <span className="ratecard__name">
          {current?.handle}
          {isMine && <span className="badge badge--you">YOU</span>}
        </span>

        <button className={`playbtn ${playing ? 'playbtn--on' : ''}`} onClick={playing ? stop : play}>
          <span className="playbtn__icon">{playing ? '■' : '▶'}</span>
          {playing ? 'Stop' : isMine ? 'Play my take' : 'Play take'}
        </button>

        {isMine ? (
          <p className="muted">That’s you 🔥 — you can’t score your own take.</p>
        ) : (
          <div className="ratecard__scores">
            {Array.from({ length: 10 }).map((_, i) => {
              const val = i + 1;
              const on = current && scores[current.performerId] === val;
              return (
                <button
                  key={val}
                  className={`scorebtn ${on ? 'scorebtn--on' : ''}`}
                  onClick={() => current && setScores((s) => ({ ...s, [current.performerId]: val }))}
                >
                  {val}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rating__nav">
        {idx > 0 && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              stop();
              setIdx((i) => i - 1);
            }}
          >
            ‹ Previous
          </button>
        )}
        {idx < takes.length - 1 ? (
          <button
            className="btn btn--hot"
            disabled={!isMine && (current ? scores[current.performerId] == null : true)}
            onClick={() => {
              stop();
              setIdx((i) => i + 1);
            }}
          >
            Next take ›
          </button>
        ) : (
          <button className="btn btn--hot btn--big" disabled={!allScored || busy} onClick={submit}>
            {allScored ? 'LOCK IN SCORES' : 'Score everyone first'}
          </button>
        )}
      </div>
    </div>
  );
}
