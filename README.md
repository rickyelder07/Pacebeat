# PaceBeat

**Build running playlists that match your pace — no account needed to start.**

PaceBeat generates playlists where every track's tempo matches your target running cadence. Configure your pace zones, pick music by artist or genre (powered by Deezer's public catalog — no login required), and save the finished playlist to Spotify or Apple Music when you're ready.

---

## User flow

1. **Set your profile** — age, weight, height, sex, fitness level. Used to compute pace zones and target BPM.
2. **Configure your run** — pick a pace zone (Easy, Tempo, Interval, etc.) and set duration or distance. Or build a multi-segment workout / enter a race goal.
3. **Pick a music source** (no login required):
   - **By Artist** — search Deezer's catalog; app fetches the full discography with native BPM data
   - **By Genre** — pick from a curated list of running-friendly genres; tracks are pre-filtered to your target BPM
4. **Review the playlist** — tracks are matched to your BPM window. Reshuffle, swap individual songs, or reorder as needed.
5. **Choose an output destination** — Spotify (available now) or Apple Music (coming soon)
6. **Authenticate & save** — sign in to your chosen platform at this step; the playlist is created in your library via ISRC-matched tracks

> The legacy version required Spotify login on the home page before any other action. The new flow defers authentication entirely to step 6 — you can build and preview a full playlist before ever connecting an account.

---

## Features

- **Pace zones** computed from profile via heart-rate and VO₂ max estimates
- **Simple mode** — one pace for the whole run
- **Workout mode** — multi-segment runs with per-segment pace targets and durations
- **Race mode** — goal time for common distances (5K, 10K, half, full marathon) split into even-paced segments
- **BPM tolerance slider** — widen or narrow the tempo window
- **Artist source** — fetches full discography via Deezer (up to 150 tracks with native BPM)
- **Genre source** — BPM-filtered search via Deezer; tracks arrive pre-matched
- **Reshuffle** — re-pick from the analyzed pool for a fresh tracklist
- **Replace track** — swap individual songs without rebuilding
- **Reorder** — move tracks within segments
- **ISRC bridge** — Deezer ISRCs resolve to Spotify (or future Apple Music) track URIs at save time
- **Spotify dev mode** — add `?dev=true` to `/build` for the legacy "build from your library" source (requires Spotify auth; limited to allowlisted users)

---

## Tech stack

- **React** + **TypeScript**
- **TanStack Start** (SSR + server functions, deployed on Cloudflare Workers)
- **Tailwind CSS** + **shadcn/ui**
- **Deezer public API** — artist/genre/BPM search, no user auth required; all calls proxied server-side to avoid CORS
- **Spotify Web API** — Authorization Code with PKCE; used only for playlist output (deferred to save step)
- **Apple Music** — planned output destination (MusicKit JS + developer token)
- [`web-audio-beat-detector`](https://github.com/chrisguttandin/web-audio-beat-detector) — audio-analysis BPM fallback

---

## Setup

### 1. Install and run

```bash
bun install
bun dev
```

The app runs at `http://localhost:3000`. No environment variables required — Deezer catalog browsing works immediately.

### 2. Connect Spotify (only needed to save playlists)

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Add `http://localhost:3000/callback` under **Redirect URIs** (plus your production URL).
3. Copy the **Client ID** — you'll be prompted to enter it at the save step. Stored in `localStorage`; no server config needed.

> Spotify's development mode limits apps to 25 allowlisted users. Add users under "User Management" in your app settings.

### 3. Deploy

```bash
bun run deploy
```

Runs `vite build` then deploys to Cloudflare Workers via `wrangler deploy --config dist/server/wrangler.json`.

---

## How BPM detection works

1. **Native Deezer BPM** — Deezer tracks include a `bpm` field available immediately for artist and genre sources.
2. **Deezer ISRC lookup** — for Spotify-sourced tracks (dev mode), each track's ISRC is sent to Deezer to retrieve BPM.
3. **Audio analysis fallback** — if Deezer has a preview URL but no BPM, [`web-audio-beat-detector`](https://github.com/chrisguttandin/web-audio-beat-detector) analyzes it in the browser via Web Audio API.

Tracks with no BPM data from any source are excluded.

---

## Roadmap

- [ ] Deferred Spotify auth — authenticate only at the save step, not on page load
- [ ] Apple Music output
- [ ] Public launch (remove Spotify dev-mode user cap dependency)
