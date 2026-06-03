// Robust parsing of the common YouTube URL shapes down to an 11-char video ID.
// Handles: watch?v=, youtu.be/, /embed/, /shorts/, /live/, music.youtube,
// extra query params, and a bare 11-char ID pasted on its own.

const ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();

  // Bare video id pasted directly.
  if (ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const isYouTube =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be' ||
    host.endsWith('.youtube.com');
  if (!isYouTube) return null;

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && ID_RE.test(id) ? id : null;
  }

  // watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && ID_RE.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const parts = url.pathname.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (['embed', 'shorts', 'live', 'v'].includes(parts[i])) {
      const id = parts[i + 1];
      if (id && ID_RE.test(id)) return id;
    }
  }

  // Last-ditch: any path segment that looks like an id.
  const candidate = parts.find((p) => ID_RE.test(p));
  return candidate ?? null;
}
