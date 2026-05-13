// Server-side Deezer proxy. Deezer's public API does not send
// Access-Control-Allow-Origin, so browser fetches fail. We call it from the
// worker instead.
import { createServerFn } from "@tanstack/react-start";

export interface DeezerResolved {
  previewUrl: string | null;
  bpm: number | null;
}

export interface DeezerArtistResult {
  id: number;
  name: string;
  picture_medium: string;
  nb_album: number;
}

export interface DeezerFullTrack {
  id: number;
  title: string;
  duration: number;
  bpm: number;
  isrc: string;
  preview: string;
  artist: { id: number; name: string };
  album?: { id: number; title: string; cover_medium: string };
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

export const searchDeezerArtists = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const q = (data as { q?: string })?.q ?? "";
    return { q: String(q).slice(0, 200) };
  })
  .handler(async ({ data }) => {
    const r = await fetchJson<{ data: DeezerArtistResult[] }>(
      `https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(data.q)}`,
    );
    return { artists: r?.data ?? [] };
  });

interface DeezerAlbum {
  id: number;
  title: string;
  cover_medium: string;
  record_type?: string;
}

interface DeezerAlbumResponse {
  id: number;
  title: string;
  cover_medium: string;
  tracks: { data: DeezerFullTrack[] };
}

// Compound server function: fetches albums then full track data (with BPM + ISRC) in one server round-trip.
export const getDeezerArtistTrackPool = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { artistId?: number | string; limit?: number };
    return { artistId: Number(d.artistId), limit: Math.min(Number(d.limit ?? 150), 200) };
  })
  .handler(async ({ data }) => {
    const albumsRes = await fetchJson<{ data: DeezerAlbum[] }>(
      `https://api.deezer.com/artist/${data.artistId}/albums?limit=25&index=0`,
    );
    const albums = albumsRes?.data ?? [];

    const seen = new Set<number>();
    const tracks: DeezerFullTrack[] = [];

    for (const album of albums) {
      if (tracks.length >= data.limit) break;
      const albumFull = await fetchJson<DeezerAlbumResponse>(
        `https://api.deezer.com/album/${album.id}`,
      );
      if (!albumFull) continue;
      for (const t of albumFull.tracks?.data ?? []) {
        if (!seen.has(t.id) && tracks.length < data.limit) {
          seen.add(t.id);
          tracks.push({
            ...t,
            album: { id: albumFull.id, title: albumFull.title, cover_medium: albumFull.cover_medium },
          });
        }
      }
    }

    return { tracks };
  });

export const searchDeezerTracksByBpm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = data as { genre?: string; bpmMin?: number; bpmMax?: number; limit?: number };
    return {
      genre: String(d.genre ?? "").slice(0, 100),
      bpmMin: Number(d.bpmMin ?? 120),
      bpmMax: Number(d.bpmMax ?? 200),
      limit: Math.min(Number(d.limit ?? 75), 100),
    };
  })
  .handler(async ({ data }) => {
    // Use Deezer's genre: qualifier so results are genre-filtered rather than
    // text-matched. Plain `q=pop` returns near-zero results because "pop" is
    // effectively a stopword in Deezer's track/artist/album name index.
    const q = `genre:"${data.genre}"`;
    const url = `https://api.deezer.com/search/track?limit=${data.limit}&q=${encodeURIComponent(q)}`;
    const r = await fetchJson<{ data: DeezerFullTrack[] }>(url);
    return { tracks: r?.data ?? [] };
  });

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
