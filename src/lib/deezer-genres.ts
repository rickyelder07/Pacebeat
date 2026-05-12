export interface RunningGenre {
  id: number;
  name: string;
  searchTerm: string;
}

export const RUNNING_GENRES: RunningGenre[] = [
  { id: 116, name: "Hip-Hop", searchTerm: "hip hop" },
  { id: 106, name: "Electronic", searchTerm: "electronic" },
  { id: 132, name: "Pop", searchTerm: "pop" },
  { id: 152, name: "Rock", searchTerm: "rock" },
  { id: 129, name: "Latin", searchTerm: "latin" },
  { id: 165, name: "R&B / Soul", searchTerm: "r&b" },
  { id: 148, name: "Reggaeton", searchTerm: "reggaeton" },
  { id: 85,  name: "Alternative", searchTerm: "alternative" },
  { id: 153, name: "Metal", searchTerm: "metal" },
  { id: 144, name: "Dance", searchTerm: "dance" },
];
