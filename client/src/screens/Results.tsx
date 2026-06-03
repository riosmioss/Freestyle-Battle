import { useEffect, useMemo } from 'react';
import Equalizer from '../components/Equalizer';
import type { RecordingsPayload, RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
  recordings: RecordingsPayload | null;
}

function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export default function Results({ room, you, actions, recordings }: Props) {
  const isHost = room.hostId === you;
  const results = room.results;

  // Downloadable vocal takes for this round.
  const haveTakes = recordings && recordings.roundNumber === room.roundNumber;
  const downloads = useMemo(() => {
    const map: Record<string, { url: string; filename: string }> = {};
    if (haveTakes) {
      for (const r of recordings!.recordings) {
        const url = URL.createObjectURL(new Blob([r.data], { type: r.mimeType }));
        const safe = r.handle.replace(/[^a-z0-9]+/gi, '_');
        map[r.performerId] = { url, filename: `${safe}_round${recordings!.roundNumber}.${extFor(r.mimeType)}` };
      }
    }
    return map;
  }, [haveTakes, recordings, room.roundNumber]);

  useEffect(() => () => Object.values(downloads).forEach((d) => URL.revokeObjectURL(d.url)), [downloads]);

  if (!results) return null;

  const winner = results.scores.find((s) => s.playerId === results.winnerId);
  const hasMoreBeats = room.beats.length > 0;

  return (
    <div className="results">
      <p className="results__round">ROUND {results.roundNumber} · {results.beatLabel}</p>

      {winner ? (
        <div className="crown">
          <span className="crown__icon">👑</span>
          <span className="crown__name">{winner.handle}</span>
          <span className="crown__score">{winner.average.toFixed(2)} avg</span>
          <Equalizer bars={11} className="crown__eq" />
        </div>
      ) : (
        <h1 className="results__title">NO CLEAR WINNER</h1>
      )}

      {/* This round's scores */}
      <section className="panel">
        <h2 className="panel__title">This Round</h2>
        <ol className="scoreboard">
          {results.scores.map((s, i) => (
            <li key={s.playerId} className={`scoreboard__row ${s.playerId === you ? 'scoreboard__row--you' : ''}`}>
              <span className="scoreboard__rank">{i + 1}</span>
              <span className="scoreboard__name">{s.handle}</span>
              <span className="scoreboard__bar">
                <span className="scoreboard__bar-fill" style={{ width: `${(s.average / 10) * 100}%` }} />
              </span>
              <span className="scoreboard__val">{s.votes ? s.average.toFixed(2) : '—'}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Download the recorded takes */}
      {haveTakes && recordings!.recordings.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Save the Takes</h2>
          <p className="muted">Vocal recordings from this round (the beat isn’t baked in).</p>
          <ul className="takes">
            {recordings!.recordings.map((r) => (
              <li key={r.performerId} className="takerow">
                <span className="takerow__name">{r.handle}</span>
                <a className="btn btn--ghost btn--sm" href={downloads[r.performerId]?.url} download={downloads[r.performerId]?.filename}>
                  ⬇ Download
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cumulative leaderboard */}
      <section className="panel">
        <h2 className="panel__title">Overall Leaderboard</h2>
        <ol className="scoreboard">
          {room.leaderboard.map((e, i) => (
            <li key={e.playerId} className={`scoreboard__row ${e.playerId === you ? 'scoreboard__row--you' : ''}`}>
              <span className="scoreboard__rank">{i + 1}</span>
              <span className="scoreboard__name">
                {e.handle}
                {e.roundsWon > 0 && <span className="badge badge--volt">{e.roundsWon}× 👑</span>}
              </span>
              <span className="scoreboard__val scoreboard__val--total">{e.totalPoints.toFixed(2)}</span>
            </li>
          ))}
        </ol>
      </section>

      {isHost ? (
        <div className="results__actions">
          <button className="btn btn--hot btn--big" disabled={!hasMoreBeats} onClick={() => actions.nextRound()}>
            NEXT ROUND
          </button>
          <button className="btn btn--ghost" onClick={() => actions.returnToLobby()}>
            Back to Lobby
          </button>
        </div>
      ) : (
        <p className="muted results__waiting">Waiting on the host to start the next round…</p>
      )}
    </div>
  );
}
