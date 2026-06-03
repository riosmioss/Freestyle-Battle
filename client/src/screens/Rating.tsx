import { useMemo, useState } from 'react';
import type { RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
}

export default function Rating({ room, you, actions }: Props) {
  // Everyone except yourself.
  const targets = useMemo(() => room.players.filter((p) => p.id !== you), [room.players, you]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(room.ratingsSubmitted.includes(you));
  const [busy, setBusy] = useState(false);

  const allRated = targets.every((t) => scores[t.id] != null);
  const waitingOn = room.players.filter((p) => p.online && !room.ratingsSubmitted.includes(p.id));

  const submit = async () => {
    setBusy(true);
    const res = await actions.submitRating(scores);
    setBusy(false);
    if (res.ok) setSubmitted(true);
  };

  if (targets.length === 0) {
    return (
      <div className="rating">
        <h1 className="rating__title">RATE THE BARS</h1>
        <p className="muted">Need at least two MCs to score a round. Waiting for results…</p>
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
      <p className="muted">Score every other MC 1–10. No rating yourself.</p>

      <div className="rating__list">
        {targets.map((t) => (
          <div key={t.id} className="ratecard">
            <span className="ratecard__name">{t.handle}</span>
            <div className="ratecard__scores">
              {Array.from({ length: 10 }).map((_, i) => {
                const val = i + 1;
                const on = scores[t.id] === val;
                return (
                  <button
                    key={val}
                    className={`scorebtn ${on ? 'scorebtn--on' : ''}`}
                    onClick={() => setScores((s) => ({ ...s, [t.id]: val }))}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn--hot btn--big" disabled={!allRated || busy} onClick={submit}>
        {allRated ? 'LOCK IN SCORES' : 'Score everyone first'}
      </button>
    </div>
  );
}
