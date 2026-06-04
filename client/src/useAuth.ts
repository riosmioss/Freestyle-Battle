import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authEnabled, supabase } from './supabase';

export interface Profile {
  id: string;
  handle: string;
  avatar: string;
  rating: number;
  battles_played: number;
  rounds_won: number;
}

interface Providers {
  google: boolean;
  email: boolean;
}

// Central auth state: the signed-in user, their profile, and sign-in/out
// helpers. Works in guest mode (returns disabled) when Supabase isn't set up.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(authEnabled);
  const [providers, setProviders] = useState<Providers>({ google: false, email: true });

  // Which sign-in providers are actually enabled in the Supabase dashboard.
  useEffect(() => {
    if (!supabase) return;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } })
      .then((r) => r.json())
      .then((s) => setProviders({ google: !!s?.external?.google, email: !!s?.external?.email }))
      .catch(() => {});
  }, []);

  // Track the session.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load (or create) the profile when the user changes.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const prof = await loadOrCreateProfile(session.user);
      if (!cancelled) {
        setProfile(prof);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const signInWithGoogle = useCallback(() => {
    return supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) return { error: new Error('Auth not available') };
    return supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setProfile(null);
  }, []);

  const updateHandle = useCallback(
    async (handle: string) => {
      if (!supabase || !session?.user) return;
      const clean = handle.trim().slice(0, 20);
      if (!clean) return;
      const { data } = await supabase
        .from('profiles')
        .update({ handle: clean, updated_at: new Date().toISOString() })
        .eq('id', session.user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    },
    [userId],
  );

  return {
    authEnabled,
    loading,
    user: (session?.user ?? null) as User | null,
    accessToken: session?.access_token ?? null,
    profile,
    providers,
    signInWithGoogle,
    signInWithEmail,
    signOut,
    updateHandle,
  };
}

async function loadOrCreateProfile(user: User): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (data) return data as Profile;

  // Fallback if the signup trigger hasn't created the row yet.
  const fallbackHandle =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'MC';
  const { data: created } = await supabase
    .from('profiles')
    .upsert({ id: user.id, handle: fallbackHandle.slice(0, 20) })
    .select()
    .maybeSingle();
  return (created as Profile) ?? null;
}
