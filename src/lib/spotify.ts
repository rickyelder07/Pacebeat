// Spotify Web API — Authorization Code with PKCE (no client secret needed).
// Runs entirely in the browser.

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-modify-public",
  "playlist-modify-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
];

const STORAGE = {
  clientId: "rb_spotify_client_id",
  verifier: "rb_pkce_verifier",
  token: "rb_spotify_token", // {access_token, refresh_token, expires_at}
  scopeVersion: "rb_spotify_scope_version",
};

const AUTH_SCOPE_VERSION = "2";

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  preview_url: string | null;
  is_local?: boolean;
  external_ids?: { isrc?: string };
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string; width: number; height: number }[] };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
  collaborative?: boolean;
  owner: { id?: string; display_name?: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  images?: { url: string }[];
}

export interface PreparedSpotifyAuth {
  url: string;
  verifier: string;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !("localStorage" in window)) return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getBrowserOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location?.origin ?? "";
}

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

function randomVerifier(len = 96): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return b64url(arr.buffer).slice(0, len);
}

export function getClientId(): string | null {
  return getStorage()?.getItem(STORAGE.clientId) ?? null;
}
export function setClientId(id: string) {
  getStorage()?.setItem(STORAGE.clientId, id.trim());
}
export function clearAuth() {
  const storage = getStorage();
  storage?.removeItem(STORAGE.token);
  storage?.removeItem(STORAGE.verifier);
  storage?.removeItem(STORAGE.scopeVersion);
}
export function logout() {
  clearAuth();
  getStorage()?.removeItem(STORAGE.clientId);
}

export function getRedirectUri(): string {
  const origin = getBrowserOrigin();
  return origin ? `${origin}/callback` : "/callback";
}

export function persistPendingAuth(verifier: string) {
  getStorage()?.setItem(STORAGE.verifier, verifier);
}

export async function prepareAuthRequest(clientIdOverride?: string): Promise<PreparedSpotifyAuth> {
  const clientId = clientIdOverride?.trim() || getClientId();
  if (!clientId) throw new Error("Missing Spotify Client ID");
  const verifier = randomVerifier();
  const challenge = b64url(await sha256(verifier));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" "),
  });
  return {
    url: `https://accounts.spotify.com/authorize?${params}`,
    verifier,
  };
}

export async function buildAuthUrl(clientIdOverride?: string): Promise<string> {
  const auth = await prepareAuthRequest(clientIdOverride);
  persistPendingAuth(auth.verifier);
  return auth.url;
}

export async function startLogin(): Promise<void> {
  const url = await buildAuthUrl();
  if (typeof document === "undefined") {
    throw new Error("Spotify login must be started in a browser.");
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_top";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const clientId = getClientId();
  const storage = getStorage();
  const verifier = storage?.getItem(STORAGE.verifier) ?? null;
  if (!clientId || !verifier) throw new Error("Missing PKCE state");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  const tok: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  storage?.setItem(STORAGE.token, JSON.stringify(tok));
  storage?.setItem(STORAGE.scopeVersion, AUTH_SCOPE_VERSION);
  storage?.removeItem(STORAGE.verifier);
  return tok;
}

async function refresh(): Promise<TokenSet | null> {
  const storage = getStorage();
  const raw = storage?.getItem(STORAGE.token) ?? null;
  const clientId = getClientId();
  if (!raw || !clientId) return null;
  const tok: TokenSet = JSON.parse(raw);
  if (!tok.refresh_token) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token,
    client_id: clientId,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const next: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tok.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  storage?.setItem(STORAGE.token, JSON.stringify(next));
  storage?.setItem(STORAGE.scopeVersion, AUTH_SCOPE_VERSION);
  return next;
}

export async function getToken(): Promise<string | null> {
  const storage = getStorage();
  if (storage?.getItem(STORAGE.scopeVersion) !== AUTH_SCOPE_VERSION) {
    clearAuth();
    return null;
  }
  const raw = storage?.getItem(STORAGE.token) ?? null;
  if (!raw) return null;
  let tok: TokenSet = JSON.parse(raw);
  if (Date.now() > tok.expires_at - 60_000) {
    const refreshed = await refresh();
    if (!refreshed) return null;
    tok = refreshed;
  }
  return tok.access_token;
}

export function isAuthed(): boolean {
  const storage = getStorage();
  return !!storage?.getItem(STORAGE.token) && storage.getItem(STORAGE.scopeVersion) === AUTH_SCOPE_VERSION;
}

function normalizeMethod(method?: string): string {
  return (method ?? "GET").toUpperCase();
}

function isPlaylistItemsWritePath(path: string, method?: string): boolean {
  if (normalizeMethod(method) !== "POST") return false;
  return /^\/playlists\/[^/]+\/(?:items|tracks)(?:\?|$)/.test(path);
}

function isPlaylistItemsReadPath(path: string, method?: string): boolean {
  if (normalizeMethod(method) !== "GET") return false;
  return /^\/playlists\/[^/]+\/(?:items|tracks)(?:\?|$)/.test(path);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const maxAttempts = 4;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      globalThis.clearTimeout(timeout);
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new Error("Spotify took too long to respond. Please retry or reconnect Spotify.");
      }
      throw error;
    }
    globalThis.clearTimeout(timeout);

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return res.json();
    }

    if (res.status === 401) {
      clearAuth();
      throw new Error("Spotify session expired. Please reconnect Spotify.");
    }

    // Retry on transient errors and rate limits
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    if (retryable && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const body = await res.text();
    if (res.status === 403) {
      const lowerBody = body.toLowerCase();
      if (lowerBody.includes("insufficient client scope") || lowerBody.includes("insufficient scope")) {
        clearAuth();
        throw new Error("Spotify access needs to be refreshed. Please reconnect Spotify and try again.");
      }
      let message = "";
      try {
        message = JSON.parse(body)?.error?.message ?? "";
      } catch {
        // ignore
      }
      const method = normalizeMethod(init.method);
      const isWrite = method === "POST" || method === "PUT" || method === "DELETE";
      // Spotify returns a bare 403 "Forbidden" on writes when the app is in
      // Development Mode and the account isn't on the app's user allowlist.
      if (isPlaylistItemsWritePath(path, init.method) && (!message || message.toLowerCase() === "forbidden")) {
        throw new Error(
          "Spotify blocked adding tracks to the playlist (403 Forbidden). Your app connection is working because the playlist itself was created, so this is usually a playlist-items permission issue rather than a login issue. Reconnect Spotify once, then try again. If it still fails, confirm the app is using the latest playlist write endpoint and that your Spotify app/user pair is approved in Spotify Developer Dashboard."
        );
      }
      if (isWrite && (!message || message.toLowerCase() === "forbidden")) {
        throw new Error(
          "Spotify refused this request (403 Forbidden). This usually means the Spotify app is in Development Mode and your account isn't on its user allowlist. Open the Spotify Developer Dashboard → your app → Settings → User Management, add the Spotify account you're signed in with, then try again. (If you own the app, you can also request Extended Quota Mode to allow any user.)"
        );
      }
      if (isPlaylistItemsReadPath(path, init.method) && (!message || message.toLowerCase() === "forbidden")) {
        throw new Error(
          "Spotify won't let this app read that playlist (403 Forbidden). This usually means either the playlist isn't readable by the connected account, or Spotify blocked the older playlist-tracks endpoint for this app. Try again with the latest connection; if it still fails, use a playlist you own or collaborate on, or use Liked Songs."
        );
      }
      throw new Error(
        message
          ? `Spotify refused this request (403): ${message}`
          : `Spotify refused this request (403). ${body || "No details returned."}`
      );
    }
    throw new Error(`Spotify API ${res.status}: ${body}`);
  }

  throw (lastError instanceof Error ? lastError : new Error("Spotify request failed"));
}

export async function getMe(): Promise<SpotifyUser> {
  return api("/me");
}

// Spotify-owned algorithmic/editorial playlists (Discover Weekly, Daily Mix,
// Today's Top Hits, Release Radar, etc.) are no longer accessible via the
// Web API for apps in Development Mode — they return 403/404. We also allow
// collaborative playlists because Spotify's playlist-items endpoint supports
// owners and collaborators.
export function isReadablePlaylist(playlist: SpotifyPlaylist, currentUserId: string | null): boolean {
  const ownerId = playlist.owner?.id;
  if (!ownerId) return true;
  if (ownerId === "spotify") return false;
   if (playlist.collaborative) return true;
  if (!currentUserId) return true;
  return ownerId === currentUserId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function withQuery(path: string, params: Record<string, string>): string {
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function extractPlaylistTotal(value: unknown): number {
  if (!isRecord(value)) return 0;
  const tracks = value.tracks;
  if (typeof tracks === "number") return Math.max(0, tracks);
  if (isRecord(tracks) && typeof tracks.total === "number") return Math.max(0, tracks.total);
  if (isRecord(tracks) && Array.isArray(tracks.items)) return tracks.items.length;
  return 0;
}

async function hydratePlaylistTotals(playlists: SpotifyPlaylist[]): Promise<SpotifyPlaylist[]> {
  return Promise.all(
    playlists.map(async (playlist) => {
      try {
        const r = await api<{ tracks?: { total?: number } }>(`/playlists/${playlist.id}?fields=tracks(total)`);
        return {
          ...playlist,
          tracks: { total: typeof r.tracks?.total === "number" ? r.tracks.total : playlist.tracks.total },
        };
      } catch {
        return playlist;
      }
    })
  );
}

export async function getMyPlaylists(max = 50): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  let url: string | null = `/me/playlists?limit=50`;
  while (url && out.length < max) {
    const r: {
      items: Array<Partial<SpotifyPlaylist> | null>;
      next: string | null;
    } = await api(url);
    out.push(
      ...(r.items ?? []).flatMap((item) => {
        if (!item?.id) return [];
        return [{
          id: item.id,
          name: item.name ?? "Untitled playlist",
          images: Array.isArray(item.images) ? item.images.filter((image): image is { url: string } => !!image?.url) : [],
          tracks: { total: extractPlaylistTotal(item) },
          collaborative: !!item.collaborative,
          owner: item.owner ?? {},
        } satisfies SpotifyPlaylist];
      })
    );
    url = r.next ? r.next.replace("https://api.spotify.com/v1", "") : null;
  }
  const playlists = out.slice(0, max);
  if (playlists.length > 0 && playlists.every((playlist) => playlist.tracks.total === 0)) {
    return hydratePlaylistTotals(playlists);
  }
  return playlists;
}

function normalizeSpotifyTrack(value: unknown): SpotifyTrack | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string"
    ? value.id
    : isRecord(value.linked_from) && typeof value.linked_from.id === "string"
    ? value.linked_from.id
    : typeof value.uri === "string" && value.uri.startsWith("spotify:track:")
    ? value.uri.split(":").at(-1) ?? null
    : null;
  const name = typeof value.name === "string" ? value.name : null;
  const uri = typeof value.uri === "string" ? value.uri : null;
  const durationMs = typeof value.duration_ms === "number" ? value.duration_ms : null;
  const album = isRecord(value.album) ? value.album : null;
  const artists = Array.isArray(value.artists)
    ? value.artists.flatMap((artist) => {
        if (!isRecord(artist) || typeof artist.name !== "string") return [];
        return [{
          id: typeof artist.id === "string" ? artist.id : "",
          name: artist.name,
        }];
      })
    : [];

  if (!id || !name || !uri || durationMs === null || artists.length === 0) return null;

  return {
    id,
    name,
    uri,
    duration_ms: durationMs,
    preview_url: typeof value.preview_url === "string" ? value.preview_url : null,
    is_local: value.is_local === true,
    external_ids: isRecord(value.external_ids) && typeof value.external_ids.isrc === "string"
      ? { isrc: value.external_ids.isrc }
      : undefined,
    artists,
    album: {
      name: typeof album?.name === "string" ? album.name : "",
      images: Array.isArray(album?.images)
        ? album.images.flatMap((image) => {
            if (!isRecord(image) || typeof image.url !== "string") return [];
            return [{
              url: image.url,
              width: typeof image.width === "number" ? image.width : 0,
              height: typeof image.height === "number" ? image.height : 0,
            }];
          })
        : [],
    },
  };
}

function extractTrackId(item: unknown): string | null {
  if (!item) return null;
  const track = isRecord(item) && "track" in item ? item.track : item;
  if (!isRecord(track)) return null;
  if (typeof track.id === "string") return track.id;
  if (isRecord(track.linked_from) && typeof track.linked_from.id === "string") return track.linked_from.id;
  if (typeof track.uri === "string" && track.uri.startsWith("spotify:track:")) {
    return track.uri.split(":").at(-1) ?? null;
  }
  return null;
}

function extractPlaylistTrack(item: unknown): SpotifyTrack | null {
  if (!item) return null;
  const track = isRecord(item) && "track" in item ? item.track : item;
  const normalized = normalizeSpotifyTrack(track);
  if (!normalized || normalized.is_local || !normalized.id) return null;
  return normalized;
}

async function hydrateTracksByIds(ids: string[]): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await api<{ tracks?: unknown[] }>(`/tracks?ids=${encodeURIComponent(chunk.join(","))}`);
    for (const item of r.tracks ?? []) {
      const track = normalizeSpotifyTrack(item);
      if (track && !track.is_local) out.push(track);
    }
  }
  return out;
}

export async function getPlaylistTracks(playlistId: string, max = 200): Promise<SpotifyTrack[]> {
  const readFrom = async (initialUrl: string): Promise<{
    tracks: SpotifyTrack[];
    itemCount: number;
    total: number | null;
  }> => {
    const out = new Map<string, SpotifyTrack>();
    const missingIds = new Set<string>();
    let itemCount = 0;
    let total: number | null = null;
    let url: string | null = initialUrl;
    while (url && out.size < max) {
      const r: {
        items?: unknown[];
        next?: string | null;
        total?: number;
        tracks?: { items?: unknown[]; next?: string | null; total?: number };
      } = await api(url);
      const pageItems = r.items ?? r.tracks?.items ?? [];
      itemCount += pageItems.length;
      if (typeof r.total === "number") total = r.total;
      if (typeof r.tracks?.total === "number") total = r.tracks.total;
      for (const item of pageItems) {
        const track = extractPlaylistTrack(item);
        if (track) {
          out.set(track.id, track);
          continue;
        }
        const id = extractTrackId(item);
        if (id && !out.has(id)) missingIds.add(id);
      }
      const next = r.next ?? r.tracks?.next ?? null;
      url = next ? next.replace("https://api.spotify.com/v1", "") : null;
    }
    if (out.size < max && missingIds.size > 0) {
      const hydrated = await hydrateTracksByIds(Array.from(missingIds).slice(0, max - out.size));
      for (const track of hydrated) out.set(track.id, track);
    }
    return {
      tracks: Array.from(out.values()).slice(0, max),
      itemCount,
      total,
    };
  };

  const candidates = [
    `/playlists/${playlistId}/items?limit=100&market=from_token&additional_types=track`,
    `/playlists/${playlistId}?market=from_token&fields=tracks.total,tracks.items(track(id,name,uri,duration_ms,preview_url,is_local,external_ids,linked_from(id),artists(id,name),album(name,images))),tracks.next`,
    `/playlists/${playlistId}/items?limit=100&additional_types=track`,
    `/playlists/${playlistId}?fields=tracks.total,tracks.items(track(id,name,uri,duration_ms,preview_url,is_local,external_ids,linked_from(id),artists(id,name),album(name,images))),tracks.next`,
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const result = await readFrom(candidate);
      if (result.tracks.length > 0) return result.tracks;
      if (result.itemCount > 0) return result.tracks;
      if (result.total === 0) return [];
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  return [];
}

export async function getMyLikedTracks(max = 200): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let url: string | null = `/me/tracks?limit=50`;
  while (url && out.length < max) {
    const r: { items: { track: SpotifyTrack }[]; next: string | null } = await api(url);
    for (const it of r.items) if (it.track && it.track.id) out.push(it.track);
    url = r.next ? r.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return out.slice(0, max);
}

export async function searchArtists(q: string): Promise<SpotifyArtist[]> {
  if (!q.trim()) return [];
  const r = await api<{ artists: { items: SpotifyArtist[] } }>(
    `/search?type=artist&limit=8&q=${encodeURIComponent(q)}`
  );
  return r.artists.items;
}

function clampSpotifyLimit(limit: number, fallback = 50): number {
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(50, Math.round(limit)));
}

export async function searchTracksByGenre(genre: string, limit = 50): Promise<SpotifyTrack[]> {
  // Spotify's current Search API accepts at most 10 results per request.
  // We still support larger total pools by paginating in valid chunks.
  const safeLimit = clampSpotifyLimit(limit);
  const perPage = 10;
  const items: SpotifyTrack[] = [];
  let offset = 0;
  while (items.length < safeLimit) {
    const remaining = safeLimit - items.length;
    const pageLimit = Math.max(1, Math.min(perPage, Math.round(remaining)));
    const r = await api<{ tracks: { items: SpotifyTrack[]; next: string | null } }>(
      `/search?type=track&limit=${pageLimit}&offset=${offset}&q=${encodeURIComponent(`genre:"${genre}"`)}`
    );
    items.push(...r.tracks.items);
    if (!r.tracks.next || r.tracks.items.length === 0) break;
    offset += r.tracks.items.length;
  }
  return items;
}

export async function getArtistTopTracks(artistId: string, market = "US"): Promise<SpotifyTrack[]> {
  const r = await api<{ tracks: SpotifyTrack[] }>(`/artists/${artistId}/top-tracks?market=${market}`);
  return r.tracks;
}

export async function getArtistAlbums(artistId: string): Promise<{ id: string }[]> {
  const r = await api<{ items: { id: string }[] }>(
    `/artists/${artistId}/albums?include_groups=album,single&limit=20`
  );
  return r.items;
}

export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
  // Album tracks endpoint returns simplified tracks (no album/preview_url consistently);
  // fetch full track objects via /tracks?ids=
  const r = await api<{ items: { id: string }[] }>(`/albums/${albumId}/tracks?limit=50`);
  const ids = r.items.map((t) => t.id).filter(Boolean);
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const all: SpotifyTrack[] = [];
  for (const chunk of chunks) {
    const tr = await api<{ tracks: SpotifyTrack[] }>(`/tracks?ids=${chunk.join(",")}`);
    all.push(...tr.tracks);
  }
  return all;
}

export async function createPlaylist(name: string, description: string) {
  return api<{ id: string; external_urls: { spotify: string } }>(
    "/me/playlists",
    {
      method: "POST",
      body: JSON.stringify({ name, description, public: false }),
    }
  );
}

export async function addTracks(playlistId: string, uris: string[]) {
  for (let i = 0; i < uris.length; i += 100) {
    await api(`/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
}

export const SPOTIFY_GENRES = [
  "pop", "rock", "hip-hop", "electronic", "dance", "house", "techno",
  "indie", "alternative", "metal", "punk", "r-n-b", "soul", "funk",
  "country", "latin", "reggaeton", "drum-and-bass", "trance",
];
