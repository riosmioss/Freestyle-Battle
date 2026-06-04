import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase client (auth + profile data). Reads safe-to-expose env values.
// If they're not set, the app runs in guest-only mode (no accounts) — so the
// game still works without any backend configured.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const authEnabled = !!supabase;
