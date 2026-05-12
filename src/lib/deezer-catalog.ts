// Client-side Deezer catalog module. All calls go through server functions to
// avoid CORS failures — never call api.deezer.com directly from browser code.
import {
  searchDeezerArtists,
  getDeezerArtistTrackPool,
  searchDeezerTracksByBpm,
  type DeezerArtistResult,
  type DeezerFullTrack,
} from "./deezer.functions";
import type { Track } from "./types";

export type { DeezerArtistResult as DeezerArtist };

export function deezerTrackToTrack(t: DeezerFullTrack): Track {
  return {
    id: String(t.id),
    name: t.title,
    durationMs: t.duration * 1000,
    bpm: t.bpm > 0 ? t.bpm : null,
    isrc: t.isrc || null,
    previewUrl: t.preview || null,
    artists: [{ name: t.artist.name }],
    album: {
      name: t.album?.title ?? "",
      imageUrl: t.album?.cover_medium ?? null,
    },
  };
}

export async function searchArtists(q: string): Promise<DeezerArtistResult[]> {
  if (!q.trim()) return [];
  const { artists } = await searchDeezerArtists({ data: { q } });
  return artists;
}

export async function getArtistTrackPool(artistId: string, limit = 150): Promise<Track[]> {
  const { tracks } = await getDeezerArtistTrackPool({
    data: { artistId: Number(artistId), limit },
  });
  return tracks.map(deezerTrackToTrack);
}

export async function fetchTracksByBpm(
  genre: string,
  bpmMin: number,
  bpmMax: number,
  limit = 75,
): Promise<Track[]> {
  const { tracks } = await searchDeezerTracksByBpm({ data: { genre, bpmMin, bpmMax, limit } });
  return tracks.map(deezerTrackToTrack);
}
