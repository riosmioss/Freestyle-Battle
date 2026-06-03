import { useState } from 'react';
import Equalizer from '../components/Equalizer';
import type { RoomState } from '../types';
import type { GameActions } from '../useGame';

interface Props {
  room: RoomState;
  you: string;
  actions: GameActions;
}

const ROUND_LENGTHS = [30, 60, 90, 120];

export default function Lobby({ room, you, actions }: Props) {
  const isHost = room.hostId === you;
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [beatErr, setBeatErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const addBeat = async () => {
    if (!url.trim()) return;
    setAdding(true);
    setBeatErr(null);
    const res = await actions.addBeat(url.trim(), label.trim());
    setAdding(false);
    if (res.ok) {
      setUrl('');
      setLabel('');
    } else {
      setBeatErr(res.error ?? 'Could not add that beat.');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  const canStart = isHost && room.activeBeatId != null && room.players.length >= 1;

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

        {/* Beats */}
        <section className="panel">
          <h2 className="panel__title">The Crate · Beats</h2>

          {room.beats.length === 0 && <p className="muted">No beats yet. {isHost ? 'Paste a YouTube link below.' : 'Host is loading the crate.'}</p>}

          <ul className="beats">
            {room.beats.map((b) => {
              const active = b.id === room.activeBeatId;
              return (
                <li key={b.id} className={`beat ${active ? 'beat--active' : ''}`}>
                  <img
                    className="beat__thumb"
                    src={`https://i.ytimg.com/vi/${b.videoId}/default.jpg`}
                    alt=""
                    loading="lazy"
                  />
                  <span className="beat__label">{b.label}</span>
                  {active && <span className="badge badge--volt">ACTIVE</span>}
                  {isHost && (
                    <span className="beat__controls">
                      {!active && (
                        <button className="btn btn--xs btn--ghost" onClick={() => actions.selectBeat(b.id)}>
                          Pick
                        </button>
                      )}
                      <button className="btn btn--xs btn--danger" onClick={() => actions.removeBeat(b.id)}>
                        ✕
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {isHost && (
            <div className="beat-add">
              <input
                className="input"
                placeholder="Paste YouTube link…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBeat()}
              />
              <input
                className="input"
                placeholder="Label (optional)"
                value={label}
                maxLength={40}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBeat()}
              />
              <button className="btn btn--hot btn--sm" disabled={adding} onClick={addBeat}>
                Add
              </button>
              {beatErr && <p className="error">{beatErr}</p>}
            </div>
          )}
        </section>
      </div>

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
            {room.activeBeatId ? 'START THE BATTLE' : 'Pick a beat to start'}
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
