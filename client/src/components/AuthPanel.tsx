import { useState } from 'react';
import type { useAuth } from '../useAuth';

type Auth = ReturnType<typeof useAuth>;

// Sign-in / profile bar shown on the home screen. Guests can ignore it and
// play below; signing in saves your handle + global rank.
export default function AuthPanel({ auth }: { auth: Auth }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!auth.authEnabled || auth.loading) return null;

  // Signed in
  if (auth.profile) {
    return (
      <div className="authbar authbar--in">
        <span className="authbar__who">
          <span className="authbar__avatar">{auth.profile.avatar}</span>
          <span className="authbar__name">{auth.profile.handle}</span>
          <span className="authbar__rating">⭐ {auth.profile.rating}</span>
        </span>
        <button className="btn btn--ghost btn--xs" onClick={() => auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await auth.signInWithEmail(email);
    setBusy(false);
    if (res?.error) setErr(res.error.message);
    else setSent(true);
  };

  // Signed out
  return (
    <div className="authbar">
      <p className="authbar__tag">Sign in to save your handle & climb the global rank</p>
      <div className="authbar__actions">
        {auth.providers.google && (
          <button className="btn btn--ghost btn--sm" onClick={() => auth.signInWithGoogle()}>
            Continue with Google
          </button>
        )}
        {!sent ? (
          <div className="authbar__email">
            <input
              className="input"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendLink()}
            />
            <button className="btn btn--volt btn--sm" disabled={busy} onClick={sendLink}>
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          </div>
        ) : (
          <p className="muted">✉️ Check your email for the sign-in link, then come back here.</p>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <p className="muted authbar__guest">…or just play as a guest below — no account needed.</p>
    </div>
  );
}
