export interface Track {
  id: string;
  name: string;
  durationMs: number;
  bpm: number | null;
  isrc: string | null;
  previewUrl: string | null;
  artists: { name: string }[];
  album: { name: string; imageUrl: string | null };
  spotifyUri?: string | null;
}
