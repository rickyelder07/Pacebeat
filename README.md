# PaceBeat

**Build running playlists that match your pace.**

PaceBeat connects to your Spotify account and generates playlists where every track's tempo matches your target running pace. Set your pace zones, pick a music source, and the app picks songs that keep you on beat — then saves the playlist directly to your Spotify library.

---

## How it works

1. **Set your profile** — age, weight, height, sex, and fitness level. PaceBeat uses this to compute realistic pace zones.
2. **Pick a pace** — choose a zone (Easy, Moderate, Tempo, etc.), set workout duration or distance, and dial in BPM tolerance. You can also build multi-segment workouts (warm-up → tempo → cooldown) or enter a race goal pace.
3. **Choose a music source** — pull tracks from your Liked Songs, any playlist in your Spotify library, or search for an artist.
4. **Build** — PaceBeat analyzes each track's tempo using Deezer's BPM database (matched by ISRC) and falls back to audio analysis when needed. Tracks are filtered to your target BPM window, then ordered and timed to cover your full run.
5. **Save to Spotify** — the playlist is created or updated in your Spotify account in one click.

---

## Features

- **Pace zones** computed from your profile via heart-rate and VO₂ max estimates
- **Simple mode** — one pace for the whole run
- **Workout mode** — build multi-segment runs with per-segment pace targets and durations
- **Race mode** — enter a goal time for common distances (5K, 10K, half, full marathon); the app divides the race into even-paced segments
- **BPM tolerance slider** — widen or narrow the tempo window to trade variety for precision
- **Artist source** — searches across top tracks and full discography (up to 150 songs)
- **Liked Songs / playlist source** — works with any playlist you own or follow
- **Reshuffle** — re-pick from the analyzed pool for a fresh tracklist
- **Replace track** — swap individual songs without rebuilding from scratch
- **Reorder** — drag tracks up or down within each segment
- **Smart playlist naming** — saves to a fixed "Playlist by PaceBeat" and replaces it on future saves, or create a named playlist
- **Tempo display** — see the detected BPM for every track in the list

---

## Tech stack

- **React** + **TypeScript**
- **TanStack Start** (SSR + server functions via Vite)
- **Tailwind CSS** + **shadcn/ui**
- **Spotify Web API** — Authorization Code with PKCE (no backend secret required)
- **Deezer API** — server-side proxy for BPM lookup and audio preview URLs
- [`web-audio-beat-detector`](https://github.com/chrisguttandin/web-audio-beat-detector) — audio-analysis fallback for tracks Deezer doesn't have

---

## Setup

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Redirect URIs**, add `http://localhost:3000/callback` (and your production URL if deploying).
3. Copy the **Client ID**.

> Note: Spotify's development mode limits apps to 25 allowlisted users. You'll need to add any users manually under your app's "User Management" settings, or apply for Extended Quota Mode if you're building for a wider audience.

### 2. Install and run

```bash
bun install
bun dev
```

The app runs at `http://localhost:3000`.

### 3. Connect Spotify

On the home page, paste your Spotify Client ID. The app stores it in `localStorage` — no server-side configuration needed. Authorize with Spotify and you're ready to build.

---

## Spotify API scopes used

| Scope | Why |
|---|---|
| `user-read-private` | Identify your account for playlist ownership |
| `user-read-email` | Display your connected account in error states |
| `user-library-read` | Read your Liked Songs |
| `playlist-read-private` | Read playlists you own or follow |
| `playlist-read-collaborative` | Read collaborative playlists |
| `playlist-modify-public` | Create and update public playlists |
| `playlist-modify-private` | Create and update private playlists |

---

## How BPM detection works

Spotify removed audio features (including tempo) from its API in 2024. PaceBeat resolves BPM through two fallback layers:

1. **Deezer ISRC lookup** — most Spotify tracks have an ISRC code. PaceBeat queries Deezer's API server-side (to avoid CORS) by ISRC and reads the native BPM field. This works for the large majority of tracks.
2. **Audio analysis** — if Deezer doesn't have a BPM for a track but has a 30-second preview, PaceBeat downloads the preview and runs beat detection in the browser using the Web Audio API. This is slower but covers most remaining tracks.

Tracks with no BPM data from either source are excluded from the playlist.

---

## Pace math

PaceBeat converts pace (min/km) to BPM using a linear model calibrated to common running cadence ranges. The target cadence for a given pace is computed from your profile's estimated optimal stride frequency. The BPM window (target ± tolerance) is applied during track selection.

---

## Deployment

The app is built with TanStack Start and can be deployed to any platform that supports Node.js or edge workers. The Deezer API proxy runs as a server function — it needs a server environment (not a static host).
