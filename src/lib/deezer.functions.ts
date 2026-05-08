// Server-side Deezer proxy. Deezer's public API does not send
// Access-Control-Allow-Origin, so browser fetches fail. We call it from the
// worker instead.
import { createServerFn } from "@tanstack/react-start";

export interface DeezerResolved {
  previewUrl: string | null;
  bpm: number | null;
}

interface DeezerTrack {
  id: number;
  title: string;
  preview: string;
  bpm: number;
  artist: { name: string };
}

interface ResolveInput {
  isrc?: string | null;
  artist: string;
  title: string;
}

const EMPTY: DeezerResolved = { previewUrl: null, bpm: null };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function pick(track: DeezerTrack | null | undefined): DeezerResolved {
  if (!track) return EMPTY;
  return {
    previewUrl: track.preview || null,
    bpm: track.bpm && track.bpm > 0 ? track.bpm : null,
  };
}

async function resolveByIsrc(isrc: string): Promise<DeezerResolved> {
  const r = await fetchJson<DeezerTrack & { error?: unknown }>(
    `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`,
  );
  return r && !("error" in r && r.error) ? pick(r) : EMPTY;
}

async function resolveBySearch(artist: string, title: string): Promise<DeezerResolved> {
  const q = `artist:"${artist}" track:"${title}"`;
  const r = await fetchJson<{ data: DeezerTrack[] }>(
    `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`,
  );
  let first = r?.data?.[0];
  let out = pick(first);
  if (!first) {
    const r2 = await fetchJson<{ data: DeezerTrack[] }>(
      `https://api.deezer.com/search?limit=1&q=${encodeURIComponent(`${artist} ${title}`)}`,
    );
    first = r2?.data?.[0];
    out = pick(first);
  }
  if (out.previewUrl && !out.bpm && first?.id) {
    const full = await fetchJson<DeezerTrack>(`https://api.deezer.com/track/${first.id}`);
    if (full?.bpm && full.bpm > 0) out = { ...out, bpm: full.bpm };
  }
  return out;
}

async function resolveOne(input: ResolveInput): Promise<DeezerResolved> {
  if (input.isrc) {
    const byIsrc = await resolveByIsrc(input.isrc);
    if (byIsrc.previewUrl || byIsrc.bpm) return byIsrc;
  }
  return resolveBySearch(input.artist, input.title);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const resolveDeezerBatch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const arr = (data as { tracks?: ResolveInput[] })?.tracks;
    if (!Array.isArray(arr)) throw new Error("tracks must be an array");
    return { tracks: arr.slice(0, 100) };
  })
  .handler(async ({ data }) => {
    const results = await mapWithConcurrency(data.tracks, 8, resolveOne);
    return { results };
  });
