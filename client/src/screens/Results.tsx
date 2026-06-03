import Equalizer from '../components/Equalizer';
import type { RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
}

export default function Results({ room, you, actions }: Props) {
  const isHost = room.hostId === you;
  const results = room.results;
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
