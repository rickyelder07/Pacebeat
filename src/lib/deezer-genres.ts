export interface RunningGenre {
  id: number;
  name: string;
  searchTerm: string;
}

export const RUNNING_GENRES: RunningGenre[] = [
  { id: 132, name: "Pop",         searchTerm: "Pop" },
  { id: 116, name: "Hip-Hop",     searchTerm: "Rap/Hip Hop" },
  { id: 152, name: "Rock",        searchTerm: "Rock" },
  { id: 106, name: "Electronic",  searchTerm: "Electro" },
  { id: 113, name: "Dance",       searchTerm: "Dance" },
  { id: 165, name: "R&B / Soul",  searchTerm: "R&B" },
  { id: 122, name: "Reggaeton",   searchTerm: "Reggaeton" },
  { id: 85,  name: "Alternative", searchTerm: "Alternative" },
  { id: 464, name: "Metal",       searchTerm: "Metal" },
  { id: 197, name: "Latin",       searchTerm: "Latin Music" },
];
