## Goal

The app currently fails because Spotify's genre search returns tracks where `preview_url` is almost always `null`, so the in-browser BPM detector has nothing to analyze. We'll fix this by:

1. **Sourcing tracks from the user's own library/playlists** (where ISRC is reliably present).
2. **Looking up each track on Deezer by ISRC** to get a working 30s preview, then running the existing BPM detector on Deezer's audio.

The existing pace → target BPM logic, the BPM analyzer (`web-audio-beat-detector`), and the playlist-creation step all stay the same.

---

## Step 1 — New "Source" step: pick a playlist

Replace the current Genre/Artist tabs in the Source step with a playlist picker.

- Fetch on entry:
  - `GET /v1/me/playlists?limit=50` (paginate if needed)
  - Synthesize a "Liked Songs" entry at the top (uses `/v1/me/tracks`)
- Render as a scrollable list with cover art, name, and track count.
- User selects exactly one. Selection shape becomes:
  ```
  { kind: "liked" } | { kind: "playlist"; id: string; name: string; total: number }
  ```
- Drop the artist search and genre grid UI from this step. Keep Genre/Artist helpers in `spotify.ts` only if other code uses them (they can be removed later).

## Step 2 — Fetch the candidate pool

In the Generate step, replace the current genre/artist branching with:

- **Liked Songs**: page `/v1/me/tracks` until we have ~200 tracks (or all, capped).
- **Playlist**: page `/v1/playlists/{id}/tracks` until we have ~200 tracks (or all).
- Normalize to `SpotifyTrack[]`, ensuring each track carries its `external_ids.isrc` (request the `isrc` field — already returned by these endpoints by default).
- De-duplicate by track id and drop local-only / unavailable tracks.

200 is a sane upper bound — large enough to find ~30 min of tempo-matched songs, small enough to keep the Deezer lookup fast.

## Step 3 — Deezer BPM resolution (new module `src/lib/deezer.ts`)

For each Spotify track:

1. **Lookup by ISRC** (preferred, exact match):
   - `GET https://api.deezer.com/track/isrc:{ISRC}` (public, no key).
   - Use a JSONP-style or direct fetch. Deezer's public API supports CORS for GET on most endpoints; if CORS blocks in the browser, fall back to `?output=jsonp` via a `<script>` tag loader. Implementation will pick whichever works in dev and document the fallback.
2. **Fallback search** when no ISRC match: `GET https://api.deezer.com/search?q=artist:"X" track:"Y"&limit=1`, take first result.
3. From the Deezer track, read `preview` (30s mp3 URL) and `bpm` (Deezer reports tempo on many tracks).

Return shape:
```
{ previewUrl: string | null; deezerBpm: number | null }
```

Cache results in-memory keyed by ISRC and by `artist|title` to avoid re-fetching across runs in the same session.

## Step 4 — Combined analyzer pipeline

Update `src/lib/bpm.ts` (or wrap it):

For each Spotify track (with concurrency 4):

1. Resolve via Deezer.
2. If `deezerBpm` is present and looks valid (40–220 after normalization), use it directly — skip audio decode.
3. Otherwise, if `previewUrl` exists, run the existing `analyze()` on the Deezer mp3.
4. Otherwise, mark as `bpm: null` with reason `no preview`.

Keep the existing tempo normalization (double/half tempo folding) and the `pickForRun` selection logic unchanged.

Update progress UI copy from "X had previews / Y skipped" to something like:
"Analyzed N tracks · M tempo-matched · K skipped (no tempo data)".

## Step 5 — UI polish

- Source step header: "Pick a playlist to draw from".
- Generate step subtitle: replace "genre: hip-hop" with "from: {playlist name}".
- Empty-state error message updated to suggest picking a different playlist or widening tolerance, not "different genre/artist".

---

## Files to change

- `src/routes/build.tsx` — replace Source step UI; update Generate step pool fetch and copy; update `Step` source type.
- `src/lib/spotify.ts` — add `getMyPlaylists()`, `getPlaylistTracks(id, limit)`, `getMyLikedTracks(limit)`. Each must include `external_ids.isrc` on returned tracks. Genre/artist helpers can stay for now (unused) and be cleaned up in a follow-up.
- `src/lib/deezer.ts` — **new**. `resolveByIsrc()`, `resolveBySearch()`, `resolveTrack(spotifyTrack)`, with in-memory cache and CORS/JSONP fallback.
- `src/lib/bpm.ts` — extend `analyzeTracks()` to call Deezer resolver first, prefer Deezer's `bpm`, fall back to audio analysis on Deezer's preview, then `null`.

## Risks / notes

- Deezer's public API is unauthenticated and rate-limited (~50 req/sec per IP) — fine for ~200 lookups with concurrency 4.
- Some ISRCs won't match Deezer's catalog; the artist+title fallback covers most cases. Niche/unreleased tracks may still come back without tempo — those are skipped, same as today.
- Deezer's reported BPM is sometimes 0 or wrong on remixes; we'll treat 0 as missing and fall back to audio analysis.
