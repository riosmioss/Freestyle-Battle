import { useState } from 'react';
import Equalizer from '../components/Equalizer';
import MicCheck from '../components/MicCheck';
import { GENRES, beatsByGenre, genreLabel } from '../beats';
import type { RoomState } from '../types';
import type { GameActions } from '../useGame';
import type { MicState } from '../useMic';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
  mic: MicState;
}

const ROUND_LENGTHS = [30, 60, 90, 120];

export default function Lobby({ room, you, actions, mic }: Props) {
  const isHost = room.hostId === you;
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  const canStart = isHost && room.players.length >= 1;
  const genreCount = beatsByGenre(room.selectedGenre).length;

  return (
    <div className="lobby">
      <header className="lobby__header">
        <div className="codecard" onClick={copyCode} title="Click to copy">
          <span className="codecard__label">ROOM CODE</span>
          <span className="codecard__code">{room.code}</span>
          <span className="codecard__hint">{copied ? 'COPIED!' : 'tap to copy'}</span>
        </div>
        <div className="lobby__title-wrap">
          <Equalizer bars={6} className="lobby__eq" />
          <h1 className="lobby__title">THE LOBBY</h1>
          <p className="muted">
            Round {room.roundNumber + (room.results ? 0 : 1)} · {room.roundLength}s ·{' '}
            {isHost ? 'You run this room' : 'Waiting on the host'} ·{' '}
            <span className={room.isPublic ? 'tag-public' : 'tag-private'}>
              {room.isPublic ? '🌐 Public' : '🔒 Private'}
            </span>
          </p>
        </div>
      </header>

      <div className="lobby__grid">
        {/* Players */}
        <section className="panel">
          <h2 className="panel__title">On the Stage · {room.players.length}/8</h2>
          <ul className="players">
            {room.players.map((p) => (
              <li key={p.id} className="player">
                <span className={`dot ${p.online ? 'dot--live' : 'dot--off'}`} />
                <span className="player__name">{p.handle}</span>
                {p.id === room.hostId && <span className="badge badge--host">HOST</span>}
                {p.id === you && <span className="badge badge--you">YOU</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* Genre */}
        <section className="panel">
          <h2 className="panel__title">The Vibe · Genre</h2>
          <p className="muted">A random {genreLabel(room.selectedGenre)} beat drops each round.</p>
          <div className="genre">
            {GENRES.map((g) => {
              const on = room.selectedGenre === g.id;
              return (
                <button
                  key={g.id}
                  className={`genre__btn ${on ? 'genre__btn--on' : ''}`}
                  disabled={!isHost}
                  onClick={() => isHost && actions.selectGenre(g.id)}
                >
                  <span className="genre__label">{g.label}</span>
                  <span className="genre__count">{beatsByGenre(g.id).length} beats</span>
                </button>
              );
            })}
          </div>
          {genreCount === 0 && <p className="error">No beats loaded for this genre yet.</p>}
          {!isHost && <p className="muted">Only the host can change the genre.</p>}
        </section>
      </div>

      <MicCheck mic={mic} />

      {/* Host round controls */}
      {isHost ? (
        <section className="panel lobby__controls">
          <div className="roundlen">
            <span className="field__label">Round length</span>
            <div className="roundlen__opts">
              {ROUND_LENGTHS.map((s) => (
                <button
                  key={s}
                  className={`chip ${room.roundLength === s ? 'chip--on' : ''}`}
                  onClick={() => actions.setRoundLength(s)}
                >
                  {s}s
                </button>
              ))}
            </div>
            <div className="roundlen__visibility">
              <span className="field__label">Visibility</span>
              <button
                className={`chip ${room.isPublic ? 'chip--on' : ''}`}
                onClick={() => actions.setPublic(!room.isPublic)}
                title="Toggle whether this lobby is listed publicly"
              >
                {room.isPublic ? '🌐 Public' : '🔒 Private'}
              </button>
            </div>
          </div>
          <button className="btn btn--hot btn--big" disabled={!canStart} onClick={() => actions.startBattle()}>
            START THE BATTLE
          </button>
        </section>
      ) : (
        <section className="panel lobby__controls lobby__controls--waiting">
          <Equalizer bars={5} />
          <p className="muted">Hang tight — the host starts the battle.</p>
        </section>
      )}

      <button className="btn btn--ghost btn--sm lobby__leave" onClick={actions.leaveLobby}>
        Leave lobby
      </button>
    </div>
  );
}
