// ============================================================================
// CURATED BEAT LIBRARY (client manifest)
// ----------------------------------------------------------------------------
// The 8 MP3s live in client/public/beats/ and are served as static files.
// Each entry's `file` is the path under /public (so "/beats/xyz.mp3").
//
// 👉 JACOB: when you upload the folder, I'll set each `file` to the real
// filename and fill in `title` / `credit` (and `bpm` if you have it). Until
// then these are PLACEHOLDERS — the app builds, but the beats won't actually
// play until the real .mp3 files exist at these paths.
//
// IMPORTANT: keep the `id` + `genre` values here IN SYNC with
// server/src/beats.ts (the server picks the random beat by id+genre).
// ============================================================================

export type Genre = 'hiphop' | 'trap';

export interface BeatMeta {
  id: string; // stable id (matches server/src/beats.ts)
  title: string;
  genre: Genre;
  file: string; // path under /public, e.g. "/beats/hiphop-1.mp3"
  credit?: string; // attribution shown if the license requires it
  bpm?: number;
}

export const BEATS: BeatMeta[] = [
  // --- Hip Hop ---
  { id: 'hiphop-1', title: 'Hip Hop 1', genre: 'hiphop', file: '/beats/hiphop-1.mp3' },
  { id: 'hiphop-2', title: 'Hip Hop 2', genre: 'hiphop', file: '/beats/hiphop-2.mp3' },
  { id: 'hiphop-3', title: 'Hip Hop 3', genre: 'hiphop', file: '/beats/hiphop-3.mp3' },
  { id: 'hiphop-4', title: 'Hip Hop 4', genre: 'hiphop', file: '/beats/hiphop-4.mp3' },
  // --- Trap ---
  { id: 'trap-1', title: 'Trap 1', genre: 'trap', file: '/beats/trap-1.mp3' },
  { id: 'trap-2', title: 'Trap 2', genre: 'trap', file: '/beats/trap-2.mp3' },
  { id: 'trap-3', title: 'Trap 3', genre: 'trap', file: '/beats/trap-3.mp3' },
  { id: 'trap-4', title: 'Trap 4', genre: 'trap', file: '/beats/trap-4.mp3' },
];

export const GENRES: { id: Genre; label: string }[] = [
  { id: 'hiphop', label: 'Hip Hop' },
  { id: 'trap', label: 'Trap' },
];

export function getBeat(id: string | null | undefined): BeatMeta | undefined {
  return id ? BEATS.find((b) => b.id === id) : undefined;
}

export function beatsByGenre(genre: Genre): BeatMeta[] {
  return BEATS.filter((b) => b.genre === genre);
}

export function genreLabel(genre: Genre): string {
  return GENRES.find((g) => g.id === genre)?.label ?? genre;
}
