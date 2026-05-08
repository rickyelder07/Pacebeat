// Client-side Deezer resolver. Calls the server function so we avoid
// browser CORS failures (Deezer's API doesn't send CORS headers).
import { resolveDeezerBatch } from "./deezer.functions";

export interface DeezerResolved {
  previewUrl: string | null;
  bpm: number | null;
}

interface ResolveInput {
  isrc?: string | null;
  artist: string;
  title: string;
}

const EMPTY: DeezerResolved = { previewUrl: null, bpm: null };
const cache = new Map<string, DeezerResolved>();

function cacheKey(input: ResolveInput): string {
  return input.isrc
    ? `isrc:${input.isrc}`
    : `q:${input.artist}|${input.title}`.toLowerCase();
}

// Coalesces concurrent calls into batched server requests.
let pending: Array<{
  input: ResolveInput;
  resolve: (v: DeezerResolved) => void;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_SIZE = 25;
const FLUSH_MS = 30;

async function flush() {
  flushTimer = null;
  const batch = pending;
  pending = [];
  if (batch.length === 0) return;
  // Chunk in case more than BATCH_SIZE accumulated.
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    try {
      const { results } = await resolveDeezerBatch({
        data: { tracks: chunk.map((c) => c.input) },
      });
      chunk.forEach((c, idx) => {
        const r = results[idx] ?? EMPTY;
        cache.set(cacheKey(c.input), r);
        c.resolve(r);
      });
    } catch {
      chunk.forEach((c) => c.resolve(EMPTY));
    }
  }
}

export async function resolveTrack(input: ResolveInput): Promise<DeezerResolved> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) return cached;
  return new Promise<DeezerResolved>((resolve) => {
    pending.push({ input, resolve });
    if (pending.length >= BATCH_SIZE) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_MS);
    }
  });
}
