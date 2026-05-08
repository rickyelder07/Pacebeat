// Estimate running paces and corresponding BPM from basic physical features.
// Cadence-based: most runners cycle 160–185 SPM; faster paces → higher cadence.

export type Sex = "male" | "female" | "other";
export type Fitness = "beginner" | "casual" | "regular" | "competitive";

export interface Profile {
  age: number;
  weightKg: number;
  heightCm: number;
  sex: Sex;
  fitness: Fitness;
}

export interface PaceZone {
  id: "easy" | "long" | "tempo" | "interval";
  label: string;
  description: string;
  paceMinPerKm: number; // minutes per km
  bpm: number; // target cadence/BPM
  bpmRange: [number, number];
}

// Baseline easy pace (min/km) for a "regular" 35yo, 170cm, 70kg male.
// We adjust from there.
function basePaceMinPerKm(p: Profile): number {
  let pace = 6.0;
  // fitness
  pace += { beginner: 1.6, casual: 0.8, regular: 0.0, competitive: -0.8 }[p.fitness];
  // age — adds ~0.04 min/km per year above 30
  if (p.age > 30) pace += (p.age - 30) * 0.04;
  if (p.age < 25) pace -= (25 - p.age) * 0.02;
  // BMI-ish weight penalty above ~75kg
  if (p.weightKg > 75) pace += (p.weightKg - 75) * 0.025;
  if (p.weightKg < 60) pace -= (60 - p.weightKg) * 0.015;
  // height (taller stride helps slightly)
  pace -= (p.heightCm - 170) * 0.004;
  // sex baseline
  if (p.sex === "female") pace += 0.4;
  return Math.max(3.5, Math.min(9.0, pace));
}

function paceToBpm(paceMinPerKm: number): number {
  // Empirical: ~180 SPM at 4:30/km easing to ~158 SPM at 7:00/km
  const bpm = 200 - paceMinPerKm * 6;
  return Math.round(Math.max(140, Math.min(195, bpm)));
}

export function computeZones(p: Profile): PaceZone[] {
  const easy = basePaceMinPerKm(p);
  const make = (
    id: PaceZone["id"],
    label: string,
    description: string,
    pace: number,
  ): PaceZone => {
    const bpm = paceToBpm(pace);
    return {
      id,
      label,
      description,
      paceMinPerKm: pace,
      bpm,
      bpmRange: [bpm - 4, bpm + 4],
    };
  };
  return [
    make("long", "Long & Easy", "Conversational. Build endurance.", easy + 0.6),
    make("easy", "Easy Run", "Comfortable steady pace.", easy),
    make("tempo", "Tempo", "Comfortably hard. Threshold work.", easy - 0.8),
    make("interval", "Interval", "Fast efforts. Speed work.", easy - 1.6),
  ];
}

export function formatPace(minPerKm: number): string {
  const minPerMi = minPerKm * 1.609344;
  const m = Math.floor(minPerMi);
  const s = Math.round((minPerMi - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}/mi`;
}

export function distanceToDurationMin(km: number, paceMinPerKm: number): number {
  return km * paceMinPerKm;
}

// Imperial conversion helpers
export const KM_PER_MILE = 1.609344;
export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_INCH;
export const inToCm = (inches: number) => inches * CM_PER_INCH;
export const kmToMi = (km: number) => km / KM_PER_MILE;
export const miToKm = (mi: number) => mi * KM_PER_MILE;
