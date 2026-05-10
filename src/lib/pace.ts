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

export function paceToBpm(paceMinPerKm: number): number {
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

// ─── New feature types ────────────────────────────────────────────────────────

export type PaceMode = "simple" | "workout" | "race";

export interface RunSegment {
  id: string;
  targetBpm: number;
  durationMin: number;
  label: string;
}

export type SegmentPaceSource =
  | { kind: "zone"; zoneId: PaceZone["id"] }
  | { kind: "custom"; paceMinPerKm: number };

export interface WorkoutSegmentDef {
  id: string;
  paceSource: SegmentPaceSource;
  lengthMode: "duration" | "distance";
  durationMin: number;
  distanceMi: number;
}

export type RaceDistancePreset = "5k" | "10k" | "half" | "marathon" | "custom";
export type RampMode = "even" | "negative" | "positive";

export interface RaceConfig {
  distancePreset: RaceDistancePreset;
  customDistanceKm: number;
  goalHours: number;
  goalMinutes: number;
  goalSeconds: number;
  rampMode: RampMode;
  rampIntensityPct: number;
  numRaceSegments: number;
}

// ─── New feature functions ────────────────────────────────────────────────────

export function formatPaceKm(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function resolveWorkoutSegments(
  defs: WorkoutSegmentDef[],
  zones: PaceZone[],
): RunSegment[] {
  return defs.map((def) => {
    let paceMinPerKm: number;
    let label: string;
    if (def.paceSource.kind === "zone") {
      const src = def.paceSource;
      const zone = zones.find((z) => z.id === src.zoneId) ?? zones[1];
      paceMinPerKm = zone.paceMinPerKm;
      label = zone.label;
    } else {
      paceMinPerKm = def.paceSource.paceMinPerKm;
      label = `Custom ${paceToBpm(paceMinPerKm)} BPM`;
    }
    const durationMin =
      def.lengthMode === "duration"
        ? def.durationMin
        : distanceToDurationMin(miToKm(def.distanceMi), paceMinPerKm);
    return {
      id: def.id,
      targetBpm: paceToBpm(paceMinPerKm),
      durationMin: Math.max(1, durationMin),
      label,
    };
  });
}

const RACE_DISTANCE_KM: Record<RaceDistancePreset, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.0975,
  marathon: 42.195,
  custom: 0,
};

export function computeRaceSegments(config: RaceConfig): RunSegment[] {
  const totalDistanceKm =
    config.distancePreset === "custom"
      ? config.customDistanceKm
      : RACE_DISTANCE_KM[config.distancePreset];
  const totalGoalMin =
    config.goalHours * 60 + config.goalMinutes + config.goalSeconds / 60;
  if (totalGoalMin === 0 || totalDistanceKm === 0) return [];

  const avgPace = totalGoalMin / totalDistanceKm;
  const avgBpm = paceToBpm(avgPace);

  if (config.rampMode === "even" || config.numRaceSegments <= 1) {
    return [{ id: "race-0", targetBpm: avgBpm, durationMin: totalGoalMin, label: "Race Pace" }];
  }

  const spread = avgBpm * (config.rampIntensityPct / 100);
  const [startBpm, endBpm] =
    config.rampMode === "negative"
      ? [avgBpm - spread / 2, avgBpm + spread / 2]
      : [avgBpm + spread / 2, avgBpm - spread / 2];

  const n = config.numRaceSegments;
  const segDuration = totalGoalMin / n;
  const segDistKm = totalDistanceKm / n;

  return Array.from({ length: n }, (_, i) => {
    const bpm =
      n === 1
        ? avgBpm
        : Math.round(startBpm + ((endBpm - startBpm) * i) / (n - 1));
    const startMi = kmToMi(segDistKm * i);
    const endMi = kmToMi(segDistKm * (i + 1));
    return {
      id: `race-${i}`,
      targetBpm: Math.round(Math.max(140, Math.min(195, bpm))),
      durationMin: segDuration,
      label: `Mi ${startMi.toFixed(1)}–${endMi.toFixed(1)}`,
    };
  });
}

export function formatGoalPace(
  config: RaceConfig,
): { minPerKm: string; minPerMi: string } | null {
  const totalGoalMin =
    config.goalHours * 60 + config.goalMinutes + config.goalSeconds / 60;
  const totalDistanceKm =
    config.distancePreset === "custom"
      ? config.customDistanceKm
      : RACE_DISTANCE_KM[config.distancePreset];
  if (totalGoalMin === 0 || totalDistanceKm === 0) return null;
  const paceMinPerKm = totalGoalMin / totalDistanceKm;
  return {
    minPerKm: formatPaceKm(paceMinPerKm),
    minPerMi: formatPace(paceMinPerKm),
  };
}
