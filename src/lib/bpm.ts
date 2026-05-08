// Client-side BPM detection. Uses Deezer (by ISRC) for both tempo and a
// playable 30s preview, since Spotify previews are now mostly null.
import { analyze } from "web-audio-beat-detector";
import type { SpotifyTrack } from "./spotify";
import { resolveTrack } from "./deezer";

const cache = new Map<string, number>();

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return ctx;
}

function normalizeBpm(bpm: number): number {
  let n = bpm;
  while (n < 130) n *= 2;
  while (n > 200) n /= 2;
  return n;
}

export async function detectBpmFromUrl(url: string): Promise<number> {
  if (cache.has(url)) return cache.get(url)!;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const audio = await audioCtx().decodeAudioData(buf.slice(0));
  const bpm = await analyze(audio);
  const normalized = normalizeBpm(bpm);
  cache.set(url, normalized);
  return normalized;
}

export interface AnalyzedTrack {
  track: SpotifyTrack;
  bpm: number | null;
  error?: string;
}

export async function analyzeTracks(
  tracks: SpotifyTrack[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<AnalyzedTrack[]> {
  const results: AnalyzedTrack[] = new Array(tracks.length);
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < tracks.length) {
      const idx = i++;
      const t = tracks[idx];
      try {
        const resolved = await resolveTrack({
          isrc: t.external_ids?.isrc ?? null,
          artist: t.artists[0]?.name ?? "",
          title: t.name,
        });
        if (resolved.bpm) {
          results[idx] = { track: t, bpm: normalizeBpm(resolved.bpm) };
        } else if (resolved.previewUrl) {
          try {
            const bpm = await detectBpmFromUrl(resolved.previewUrl);
            results[idx] = { track: t, bpm };
          } catch (e) {
            results[idx] = {
              track: t,
              bpm: null,
              error: e instanceof Error ? e.message : "detect failed",
            };
          }
        } else {
          results[idx] = { track: t, bpm: null, error: "no tempo data" };
        }
      } catch (e) {
        results[idx] = {
          track: t,
          bpm: null,
          error: e instanceof Error ? e.message : "lookup failed",
        };
      }
      done++;
      onProgress?.(done, tracks.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

export function pickForRun(
  analyzed: AnalyzedTrack[],
  targetBpm: number,
  tolerance: number,
  targetMinutes: number,
): AnalyzedTrack[] {
  const matches = analyzed
    .filter((a) => a.bpm !== null && Math.abs(a.bpm - targetBpm) <= tolerance)
    .sort((a, b) => Math.abs((a.bpm ?? 0) - targetBpm) - Math.abs((b.bpm ?? 0) - targetBpm));

  const targetMs = targetMinutes * 60_000;
  const out: AnalyzedTrack[] = [];
  let total = 0;
  // greedy fill, prefer closer-to-target first, then shuffle by bpm to vary
  for (const m of matches) {
    if (total >= targetMs) break;
    out.push(m);
    total += m.track.duration_ms;
  }
  // gentle shuffle so it isn't strictly closest-first
  return out.sort(() => Math.random() - 0.5);
}

export function totalMinutes(tracks: AnalyzedTrack[]): number {
  return tracks.reduce((s, a) => s + a.track.duration_ms, 0) / 60_000;
}
