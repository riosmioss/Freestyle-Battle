-- ============================================================================
-- Freestyle Battle — database schema (run in Supabase → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in user (linked to Supabase auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  handle         text not null default 'MC',
  avatar         text not null default '🎤',
  rating         integer not null default 1000,
  battles_played integer not null default 0,
  rounds_won     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can read profiles (needed for the public leaderboard).
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

-- A user can create/update only their OWN profile.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'MC'
    ), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- round_results: one row per player per round (written by the SERVER only,
-- using the service-role key — clients can read but never write these)
-- ---------------------------------------------------------------------------
create table if not exists public.round_results (
  id             bigint generated always as identity primary key,
  room_code      text,
  round_number   integer,
  profile_id     uuid references public.profiles (id) on delete cascade,
  handle         text,
  beat_id        text,
  average        numeric,
  placement      integer,
  won            boolean default false,
  rating_before  integer,
  rating_after   integer,
  created_at     timestamptz not null default now()
);

create index if not exists round_results_profile_idx on public.round_results (profile_id);

alter table public.round_results enable row level security;

-- Public can read match history; no insert/update policies => only the
-- service-role key (the game server) can write. That keeps scores un-fakeable.
drop policy if exists "round_results_select_all" on public.round_results;
create policy "round_results_select_all" on public.round_results for select using (true);

-- ---------------------------------------------------------------------------
-- storage bucket for saved/shareable mixed clips (used in a later step)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;
