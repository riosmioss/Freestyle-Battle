import { useEffect, useRef, useState } from 'react';
import Equalizer from '../components/Equalizer';
import { loadBeat } from '../audio';
import { getBeat } from '../beats';
import { mixVocalWithBeat } from '../mix';
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

function safeName(handle: string): string {
  return handle.replace(/[^a-z0-9]+/gi, '_');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Results({ room, you, actions, recordings }: Props) {
  const isHost = room.hostId === you;
  const results = room.results;
  const haveTakes = recordings && recordings.roundNumber === room.roundNumber;
  const beat = getBeat(room.activeBeatId);

  const beatBufferRef = useRef<AudioBuffer | null>(null);
  const [mixing, setMixing] = useState<Record<string, boolean>>({});

  // Preload the round's beat so downloads can mix it in.
  useEffect(() => {
    if (!beat) return;
    let cancelled = false;
    loadBeat(beat.file)
      .then((buf) => {
        if (!cancelled) beatBufferRef.current = buf;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [beat?.file]);

  const download = async (r: RecordingsPayload['recordings'][number]) => {
    setMixing((m) => ({ ...m, [r.performerId]: true }));
    const base = `${safeName(r.handle)}_round${recordings!.roundNumber}`;
    try {
      if (beatBufferRef.current) {
        // Mixed clip: vocal + beat → WAV.
        const mixed = await mixVocalWithBeat(r.data, beatBufferRef.current);
        triggerDownload(mixed, `${base}.wav`);
      } else {
        triggerDownload(new Blob([r.data], { type: r.mimeType }), `${base}.${extFor(r.mimeType)}`);
      }
    } catch {
      // Mixing failed (e.g. unsupported vocal codec) → save the vocal-only file.
      triggerDownload(new Blob([r.data], { type: r.mimeType }), `${base}.${extFor(r.mimeType)}`);
    } finally {
      setMixing((m) => ({ ...m, [r.performerId]: false }));
    }
  };

  if (!results) return null;

  const winner = results.scores.find((s) => s.playerId === results.winnerId);

  return (
    <div className="results">
      <p className="results__round">
        ROUND {results.roundNumber} · {results.beatLabel}
      </p>

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

      {/* Download the mixed takes */}
      {haveTakes && recordings!.recordings.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Save the Takes</h2>
          <p className="muted">Your verse mixed with the beat — a clip you can share.</p>
          <ul className="takes">
            {recordings!.recordings.map((r) => (
              <li key={r.performerId} className="takerow">
                <span className="takerow__name">{r.handle}</span>
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={!!mixing[r.performerId]}
                  onClick={() => download(r)}
                >
                  {mixing[r.performerId] ? 'Mixing…' : '⬇ Download'}
                </button>
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
          <button className="btn btn--hot btn--big" onClick={() => actions.nextRound()}>
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
