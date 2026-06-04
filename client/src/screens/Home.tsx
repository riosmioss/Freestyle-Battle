import { useEffect, useState } from 'react';
import AuthPanel from '../components/AuthPanel';
import Equalizer from '../components/Equalizer';
import type { PublicLobby } from '../types';
import type { GameActions } from '../useGame';
import type { useAuth } from '../useAuth';

interface Props {
  actions: GameActions;
  connected: boolean;
  error: string | null;
  publicLobbies: PublicLobby[];
  auth: ReturnType<typeof useAuth>;
}

const HANDLE_KEY = 'fb_handle';

const phaseLabel: Record<string, string> = {
  lobby: 'In lobby',
  countdown: 'Starting…',
  battle: 'In battle',
  rating: 'Rating',
  results: 'Results',
};

export default function Home({ actions, connected, error, publicLobbies, auth }: Props) {
  const [handle, setHandle] = useState(() => localStorage.getItem(HANDLE_KEY) ?? '');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'idle' | 'join'>('idle');
  const [makePublic, setMakePublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // When signed in, your handle comes from your saved profile.
  const signedIn = !!auth.profile;
  useEffect(() => {
    if (auth.profile?.handle) setHandle(auth.profile.handle);
  }, [auth.profile?.handle]);

  const remember = () => {
    localStorage.setItem(HANDLE_KEY, handle.trim());
    // Keep the signed-in profile handle in sync if they changed it here.
    if (signedIn && handle.trim() && handle.trim() !== auth.profile?.handle) {
      void auth.updateHandle(handle.trim());
    }
  };
  const needHandle = () => {
    if (!handle.trim()) {
      setLocalErr('Pick a handle first.');
      return true;
    }
    return false;
  };

  const create = async () => {
    if (needHandle()) return;
    setBusy(true);
    remember();
    await actions.createLobby(handle.trim(), makePublic);
    setBusy(false);
  };

  const join = async () => {
    if (needHandle()) return;
    if (code.trim().length !== 4) return setLocalErr('Room codes are 4 characters.');
    setBusy(true);
    remember();
    const res = await actions.joinLobby(code.trim(), handle.trim());
    setBusy(false);
    if (!res.ok) setLocalErr(res.error ?? 'Could not join.');
  };

  const joinPublic = async (lobbyCode: string) => {
    if (needHandle()) return;
    setBusy(true);
    remember();
    const res = await actions.joinLobby(lobbyCode, handle.trim());
    setBusy(false);
    if (!res.ok) setLocalErr(res.error ?? 'Could not join.');
  };

  return (
    <div className="home">
      <div className="home__stage">
        <Equalizer bars={9} className="home__eq" />
        <h1 className="home__title">
          FREESTYLE
          <span className="home__title-accent">BATTLE</span>
        </h1>
        <p className="home__tag">Same beat. Live mics. One crown.</p>

        <AuthPanel auth={auth} />

        <div className="panel home__panel">
          <label className="field">
            <span className="field__label">Your handle</span>
            <input
              className="input input--display"
              value={handle}
              maxLength={20}
              placeholder="MC NICKNAME"
              onChange={(e) => {
                setHandle(e.target.value);
                setLocalErr(null);
              }}
            />
          </label>

          {mode === 'idle' ? (
            <>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={makePublic}
                  onChange={(e) => setMakePublic(e.target.checked)}
                />
                <span className="toggle__track">
                  <span className="toggle__thumb" />
                </span>
                <span className="toggle__label">
                  List publicly
                  <span className="toggle__hint">
                    {makePublic ? 'Anyone can find & join' : 'Code-only — invite friends'}
                  </span>
                </span>
              </label>

              <div className="home__actions">
                <button className="btn btn--hot" disabled={busy || !connected} onClick={create}>
                  Create Lobby
                </button>
                <button className="btn btn--ghost" disabled={busy} onClick={() => setMode('join')}>
                  Join by Code
                </button>
              </div>
            </>
          ) : (
            <div className="home__join">
              <input
                className="input input--code"
                value={code}
                maxLength={4}
                placeholder="CODE"
                autoFocus
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  setLocalErr(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button className="btn btn--hot" disabled={busy || !connected} onClick={join}>
                Enter
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setMode('idle')}>
                Back
              </button>
            </div>
          )}

          {(localErr || error) && <p className="error">{localErr || error}</p>}
          {!connected && <p className="muted home__status">Connecting to the stage…</p>}
        </div>

        {/* Public lobby browser */}
        <div className="panel home__browser">
          <div className="home__browser-head">
            <h2 className="panel__title">Public Battles</h2>
            <span className="dot dot--live" />
          </div>
          {publicLobbies.length === 0 ? (
            <p className="muted">No public battles right now. Create one and leave it public!</p>
          ) : (
            <ul className="publist">
              {publicLobbies.map((l) => (
                <li key={l.code} className="publob">
                  <span className="publob__code">{l.code}</span>
                  <span className="publob__info">
                    <span className="publob__host">{l.hostHandle}'s room</span>
                    <span className="publob__meta">
                      {l.playerCount}/8 · {phaseLabel[l.phase] ?? l.phase}
                    </span>
                  </span>
                  <button
                    className="btn btn--volt btn--sm"
                    disabled={busy || !connected || l.playerCount >= 8}
                    onClick={() => joinPublic(l.code)}
                  >
                    {l.playerCount >= 8 ? 'Full' : 'Join'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
