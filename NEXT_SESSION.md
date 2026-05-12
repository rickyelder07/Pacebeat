# Handoff Prompt — Pacebeat Next Session

Copy and paste the block below as your opening message in a new Claude Code session
from inside the Tempo Tuner project directory.

---

## PROMPT TO PASTE

We are working on Pacebeat, a fitness running app that builds BPM-matched pace playlists.
Check your memory for full project context before reading any code.

We are on branch `feature/deezer-source-genre-mode`. The approved buildout is:

**Goal:** Replace Spotify as the music *source* with Deezer (already partially integrated),
keep Spotify as an *output destination* (dev mode, personal use), and add a Genre mode
alongside the existing Artist mode.

**Approved architecture:**
- Deezer public catalog API (no user auth needed) → artist catalog OR genre BPM-filtered search
- Native Deezer BPM on track objects — eliminates the current ISRC cross-reference step
- ISRC codes bridge Deezer tracks → Spotify track URIs for playlist creation
- Spotify output stays as-is (OAuth already built); Apple Music output is a future phase
- "Build from Spotify playlist / Liked Songs" source moves to a hidden dev route

**Build this in order:**

### Phase 1 — Generic Track type + Deezer catalog layer
1. Define a platform-agnostic `Track` type in a new `src/lib/types.ts`:
   `{ id, name, durationMs, bpm, isrc, previewUrl, artists: [{name}], album: {name, imageUrl} }`
2. Extend `deezer.functions.ts` (the existing server-side proxy) with new server functions:
   - `searchDeezerArtists(q)` → `GET /search/artist?q=...`
   - `getDeezerArtistAlbums(artistId)` → `GET /artist/{id}/albums` (paginated)
   - `getDeezerAlbumTracks(albumId)` → `GET /album/{id}/tracks`
   - `getDeezerTrack(trackId)` → `GET /track/{id}` (includes BPM + ISRC)
   - `searchDeezerTracksByBpm(genre, bpmMin, bpmMax, limit)` → `/search/track?q=genre:"..."&bpm_min=X&bpm_max=Y`
3. Add a client-side `src/lib/deezer-catalog.ts` that calls these server functions (same
   pattern as existing `deezer.ts` → `deezer.functions.ts` relationship)

### Phase 2 — ISRC bridge to Spotify output
1. Add `resolveSpotifyUrisFromIsrcs(isrcs: string[])` to `spotify.ts`:
   uses `GET /search?type=track&q=isrc:{code}` for each ISRC (works in dev mode)
2. Update playlist creation in `build.tsx` to: take Deezer tracks → extract ISRCs →
   resolve to Spotify URIs → create Spotify playlist (existing `createPlaylist` + `addTracks`)

### Phase 3 — Genre mode source UI
1. Add a `src/lib/deezer-genres.ts` with a curated list of genres that map well to
   running (hip-hop, electronic, pop, rock, latin, etc.) with Deezer genre IDs
2. In `build.tsx` SourceStep: add "Genre" tab alongside "Artist" tab
3. Genre mode: user picks a genre → BPM range is auto-set from their pace zones →
   call `searchDeezerTracksByBpm` → tracks come back pre-BPM-filtered (no analysis needed)
4. Artist mode: user searches artist → app fetches albums → fetches individual tracks
   for BPM → picks by pace zone (same logic as current, different data source)

### Phase 4 — Move Spotify-source to hidden dev route
1. Add a `?dev=true` query param check or a hidden route `/build/dev`
2. Move "My Playlists", "Liked Songs" source tabs behind that gate
3. Main `/build` route shows only Artist and Genre sources

**Key constraint:** All Deezer API calls MUST go through `deezer.functions.ts` server
functions — Deezer's API has no CORS headers. Never call `api.deezer.com` directly
from browser code. The existing server function infrastructure (TanStack Start
`createServerFn`) handles this.

**Do not** create a new Deezer app registration — new registrations are suspended.
The existing app credentials in `deezer.functions.ts` are grandfathered in.

The `src/lib/pace.ts` and BPM analysis logic in `src/lib/bpm.ts` are largely
platform-agnostic and should need minimal changes. The heavy lifting is in replacing
`SpotifyTrack` references in `build.tsx` with the new generic `Track` type.

Start by reading `src/lib/deezer.functions.ts` and `src/lib/deezer.ts` to understand
the existing server function pattern, then read the SourceStep section of
`src/routes/build.tsx` (search for "SourceStep") to understand what you're replacing.

---

## BRANCH & REPO
- Repo: https://github.com/rickyelder07/Pacebeat
- Active branch: `feature/deezer-source-genre-mode`
- Working directory: `/Users/rickyelder/Documents/Coding Apps/Tempo Tuner`
