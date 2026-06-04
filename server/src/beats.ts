// ============================================================================
// CURATED BEAT LIBRARY (server side — id + genre + title only)
// ----------------------------------------------------------------------------
// The server picks a random beat id for the chosen genre. It doesn't need the
// audio files (clients resolve id -> file/credit via client/src/beats.ts).
// Title is kept here only so results can show the beat name.
//
// KEEP THIS IN SYNC with client/src/beats.ts (same ids, genres, titles).
// ============================================================================

export type Genre = 'hiphop' | 'trap';

export interface ServerBeat {
  id: string;
  title: string;
  genre: Genre;
}

export const BEATS: ServerBeat[] = [
  { id: 'hiphop-1', title: 'Hip Hop Beat 1', genre: 'hiphop' },
  { id: 'hiphop-2', title: 'Hip Hop Beat 2', genre: 'hiphop' },
  { id: 'hiphop-3', title: 'Hip Hop Beat 3', genre: 'hiphop' },
  { id: 'hiphop-4', title: 'Hip Hop Beat 4', genre: 'hiphop' },
  { id: 'trap-1', title: 'Trap Beat 1', genre: 'trap' },
  { id: 'trap-2', title: 'Trap Beat 2', genre: 'trap' },
  { id: 'trap-3', title: 'Trap Beat 3', genre: 'trap' },
  { id: 'trap-4', title: 'Trap Beat 4', genre: 'trap' },
];

export function isGenre(g: unknown): g is Genre {
  return g === 'hiphop' || g === 'trap';
}

export function beatTitle(id: string | null): string {
  return BEATS.find((b) => b.id === id)?.title ?? 'Unknown beat';
}

// Pick a random beat id for a genre, avoiding `exclude` (the previous beat) when
// there's more than one option so consecutive rounds vary.
export function randomBeatId(genre: Genre, exclude?: string | null): string {
  const pool = BEATS.filter((b) => b.genre === genre);
  if (pool.length === 0) return '';
  const choices = pool.length > 1 && exclude ? pool.filter((b) => b.id !== exclude) : pool;
  const list = choices.length ? choices : pool;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx].id;
}
