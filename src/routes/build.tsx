import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeZones,
  distanceToDurationMin,
  formatPace,
  formatPaceKm,
  formatGoalPace,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
  kmToMi,
  miToKm,
  paceToBpm,
  resolveWorkoutSegments,
  computeRaceSegments,
  type Fitness,
  type PaceMode,
  type PaceZone,
  type Profile,
  type RaceConfig,
  type RampMode,
  type RaceDistancePreset,
  type RunSegment,
  type Sex,
  type WorkoutSegmentDef,
} from "@/lib/pace";
import {
  getMe,
  getMyPlaylists,
  isReadablePlaylist,
  getPlaylistTracks,
  getMyLikedTracks,
  createPlaylist,
  addTracks,
  clearAuth,
  type SpotifyPlaylist,
  type SpotifyTrack,
  type SpotifyUser,
} from "@/lib/spotify";
import { analyzeTracks, pickForSegments, totalMinutes, type AnalyzedTrack } from "@/lib/bpm";
import { useRequireAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Gauge,
  Loader2,
  Music,
  RefreshCw,
  Search,
  Shuffle,
  Timer,
  Trash2,
  Wand2,
} from "lucide-react";

function fmtTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtMs(ms: number): string {
  return fmtTime(ms);
}

export const Route = createFileRoute("/build")({
  component: Build,
  head: () => ({ meta: [{ title: "Build a run playlist · PaceBeat" }] }),
});

type Step = "profile" | "pace" | "source" | "generate";

export type Source =
  | { kind: "liked" }
  | { kind: "playlist"; id: string; name: string };

function Build() {
  const authed = useRequireAuth();
  const navigate = useNavigate();
  const meRequestRef = useRef(0);
  const [step, setStep] = useState<Step>("profile");
  const [me, setMe] = useState<SpotifyUser | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  const loadMe = () => {
    const requestId = ++meRequestRef.current;
    setMeError(null);
    setMeLoading(true);
    getMe()
      .then((u) => {
        if (meRequestRef.current !== requestId) return;
        setMe(u);
        setMeLoading(false);
      })
      .catch((e: unknown) => {
        if (meRequestRef.current !== requestId) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("getMe failed:", msg);
        setMeError(msg);
        setMeLoading(false);
      });
  };
  const [profile, setProfile] = useState<Profile>({
    age: 32,
    weightKg: 72,
    heightCm: 175,
    sex: "male",
    fitness: "regular",
  });
  const [zone, setZone] = useState<PaceZone | null>(null);
  const [lengthMode, setLengthMode] = useState<"duration" | "distance">("duration");
  const [durationMin, setDurationMin] = useState(30);
  const [distanceKm, setDistanceKm] = useState(5);
  const [tolerance, setTolerance] = useState(5);
  const [source, setSource] = useState<Source | null>(null);

  const [paceMode, setPaceMode] = useState<PaceMode>("simple");
  const [workoutSegments, setWorkoutSegments] = useState<WorkoutSegmentDef[]>([
    {
      id: crypto.randomUUID(),
      paceSource: { kind: "zone", zoneId: "easy" },
      lengthMode: "duration",
      durationMin: 30,
      distanceMi: 3,
    },
  ]);
  const [raceConfig, setRaceConfig] = useState<RaceConfig>({
    distancePreset: "5k",
    customDistanceKm: 10,
    goalHours: 0,
    goalMinutes: 25,
    goalSeconds: 0,
    rampMode: "even",
    rampIntensityPct: 5,
    numRaceSegments: 4,
  });

  useEffect(() => {
    if (authed && !me && !meLoading) loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const zones = useMemo(() => computeZones(profile), [profile]);

  const segments = useMemo((): RunSegment[] => {
    if (paceMode === "simple" && zone) {
      const dmin =
        lengthMode === "duration"
          ? durationMin
          : distanceToDurationMin(distanceKm, zone.paceMinPerKm);
      return [{ id: "simple", targetBpm: zone.bpm, durationMin: dmin, label: zone.label }];
    }
    if (paceMode === "workout") return resolveWorkoutSegments(workoutSegments, zones);
    if (paceMode === "race") return computeRaceSegments(raceConfig);
    return [];
  }, [paceMode, zone, lengthMode, durationMin, distanceKm, workoutSegments, raceConfig, zones]);

  const moveSegment = (id: string, dir: -1 | 1) =>
    setWorkoutSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  const deleteSegment = (id: string) =>
    setWorkoutSegments((prev) => prev.filter((s) => s.id !== id));
  const updateSegment = (id: string, patch: Partial<WorkoutSegmentDef>) =>
    setWorkoutSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSegment = () =>
    setWorkoutSegments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        paceSource: { kind: "zone", zoneId: "easy" },
        lengthMode: "duration",
        durationMin: 20,
        distanceMi: 2,
      },
    ]);

  if (!authed) return null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-14">
        <Stepper step={step} />
        <div className="mt-8">
          {step === "profile" && (
            <ProfileStep
              profile={profile}
              onChange={setProfile}
              onNext={() => setStep("pace")}
            />
          )}
          {step === "pace" && (
            <PaceStep
              zones={zones}
              selected={zone}
              onSelect={setZone}
              lengthMode={lengthMode}
              setLengthMode={setLengthMode}
              durationMin={durationMin}
              setDurationMin={setDurationMin}
              distanceKm={distanceKm}
              setDistanceKm={setDistanceKm}
              tolerance={tolerance}
              setTolerance={setTolerance}
              paceMode={paceMode}
              setPaceMode={setPaceMode}
              workoutSegments={workoutSegments}
              onAddSegment={addSegment}
              onUpdateSegment={updateSegment}
              onMoveSegment={moveSegment}
              onDeleteSegment={deleteSegment}
              raceConfig={raceConfig}
              setRaceConfig={setRaceConfig}
              segments={segments}
              onBack={() => setStep("profile")}
              onNext={() => setStep("source")}
            />
          )}
          {step === "source" && (
            <SourceStep
              currentUserId={me?.id ?? null}
              source={source}
              onChange={setSource}
              onBack={() => setStep("pace")}
              onNext={() => setStep("generate")}
            />
          )}
          {step === "generate" && (
            segments.length > 0 && source && me ? (
              <GenerateStep
                me={me}
                segments={segments}
                source={source}
                tolerance={tolerance}
                onRestart={() => setStep("pace")}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-2xl">Getting ready…</CardTitle>
                  <CardDescription>
                    {!me
                      ? meError
                        ? "Couldn't load your Spotify profile."
                        : "Loading your Spotify profile. If this takes more than a few seconds, reconnect Spotify."
                      : segments.length === 0
                      ? "No pace selected — go back and pick one."
                      : "No music source selected — go back and pick one."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!me && !meError && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Connecting to Spotify…
                    </div>
                  )}
                  {meError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive break-words font-mono">
                      {meError}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="ghost" onClick={() => setStep("source")}>Back</Button>
                    <div className="flex gap-2">
                      {!me && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            clearAuth();
                            navigate({ to: "/" });
                          }}
                        >
                          Reconnect Spotify
                        </Button>
                      )}
                      {!me && (
                        <Button variant="hero" onClick={loadMe}>
                          {meLoading ? "Try again" : "Retry"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </main>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "You", icon: <Activity className="h-4 w-4" /> },
    { id: "pace", label: "Pace", icon: <Gauge className="h-4 w-4" /> },
    { id: "source", label: "Source", icon: <Search className="h-4 w-4" /> },
    { id: "generate", label: "Build", icon: <Music className="h-4 w-4" /> },
  ];
  const idx = items.findIndex((i) => i.id === step);
  return (
    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 transition-colors ${
              i === idx
                ? "border-primary text-primary bg-primary/10"
                : i < idx
                ? "border-border text-foreground"
                : "border-border/60"
            }`}
          >
            {it.icon}
            {it.label}
          </span>
          {i < items.length - 1 && <span className="opacity-40">/</span>}
        </div>
      ))}
    </div>
  );
}

function ProfileStep({
  profile,
  onChange,
  onNext,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">Tell us about you</CardTitle>
        <CardDescription>
          Used to estimate your pace zones. Stays in your browser — never sent anywhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Age" value={profile.age} onChange={(v) => onChange({ ...profile, age: v })} min={10} max={90} />
          <NumberField
            label="Height (in)"
            value={Math.round(cmToIn(profile.heightCm))}
            onChange={(v) => onChange({ ...profile, heightCm: inToCm(v) })}
            min={47}
            max={87}
          />
          <NumberField
            label="Weight (lb)"
            value={Math.round(kgToLb(profile.weightKg))}
            onChange={(v) => onChange({ ...profile, weightKg: lbToKg(v) })}
            min={77}
            max={440}
          />
        </div>

        <div className="space-y-2">
          <Label>Sex</Label>
          <RadioGroup
            value={profile.sex}
            onValueChange={(v) => onChange({ ...profile, sex: v as Sex })}
            className="grid grid-cols-3 gap-2"
          >
            {(["male", "female", "other"] as Sex[]).map((s) => (
              <PillRadio key={s} value={s} current={profile.sex} label={s[0].toUpperCase() + s.slice(1)} />
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Fitness level</Label>
          <RadioGroup
            value={profile.fitness}
            onValueChange={(v) => onChange({ ...profile, fitness: v as Fitness })}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {([
              ["beginner", "Beginner"],
              ["casual", "Casual"],
              ["regular", "Regular"],
              ["competitive", "Competitive"],
            ] as [Fitness, string][]).map(([v, l]) => (
              <PillRadio key={v} value={v} current={profile.fitness} label={l} />
            ))}
          </RadioGroup>
        </div>

        <div className="flex justify-end">
          <Button onClick={onNext} variant="hero" size="lg">
            Next: pick a pace <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="font-mono"
      />
    </div>
  );
}

function PillRadio({ value, current, label }: { value: string; current: string; label: string }) {
  const active = value === current;
  return (
    <label
      className={`relative flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-foreground/30"
      }`}
    >
      <RadioGroupItem value={value} className="sr-only" />
      {label}
    </label>
  );
}

function ZoneGrid({
  zones,
  selected,
  onSelect,
}: {
  zones: PaceZone[];
  selected: PaceZone | null;
  onSelect: (z: PaceZone) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {zones.map((z) => {
        const active = selected?.id === z.id;
        return (
          <button
            key={z.id}
            onClick={() => onSelect(z)}
            className={`group rounded-xl border p-4 text-left transition-all ${
              active
                ? "border-primary bg-primary/10 glow"
                : "border-border hover:border-primary/40 hover:bg-surface/40"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-semibold">{z.label}</div>
                <div className="text-xs text-muted-foreground">{z.description}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl text-primary">{z.bpm}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">bpm</div>
              </div>
            </div>
            <div className="mt-3 font-mono text-sm">{formatPace(z.paceMinPerKm)}</div>
          </button>
        );
      })}
    </div>
  );
}

function LengthPicker({
  zones,
  selected,
  lengthMode,
  setLengthMode,
  durationMin,
  setDurationMin,
  distanceKm,
  setDistanceKm,
}: {
  zones: PaceZone[];
  selected: PaceZone | null;
  lengthMode: "duration" | "distance";
  setLengthMode: (m: "duration" | "distance") => void;
  durationMin: number;
  setDurationMin: (n: number) => void;
  distanceKm: number;
  setDistanceKm: (n: number) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-4">
      <Tabs value={lengthMode} onValueChange={(v) => setLengthMode(v as "duration" | "distance")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="duration">By duration</TabsTrigger>
          <TabsTrigger value="distance">By distance</TabsTrigger>
        </TabsList>
        <TabsContent value="duration" className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>Run length</Label>
            <span className="font-mono text-lg text-primary">{durationMin} min</span>
          </div>
          <Slider min={10} max={120} step={5} value={[durationMin]} onValueChange={(v) => setDurationMin(v[0])} />
        </TabsContent>
        <TabsContent value="distance" className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>Distance</Label>
            <span className="font-mono text-lg text-primary">{kmToMi(distanceKm).toFixed(1)} mi</span>
          </div>
          <Slider
            min={1}
            max={26}
            step={1}
            value={[Math.round(kmToMi(distanceKm))]}
            onValueChange={(v) => setDistanceKm(miToKm(v[0]))}
          />
          {selected && (
            <div className="font-mono text-xs text-muted-foreground">
              ≈ {Math.round(distanceKm * selected.paceMinPerKm)} min at {formatPace(selected.paceMinPerKm)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkoutSegmentRow({
  index,
  def,
  total,
  zones,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  def: WorkoutSegmentDef;
  total: number;
  zones: PaceZone[];
  onChange: (id: string, patch: Partial<WorkoutSegmentDef>) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [customPaceStr, setCustomPaceStr] = useState(
    def.paceSource.kind === "custom" ? def.paceSource.paceMinPerKm.toFixed(2) : "6.00",
  );

  function parseCustomPace(s: string): number | null {
    // Accept "M:SS" or plain decimal like "5.5"
    const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
    if (colonMatch) {
      const m = parseInt(colonMatch[1], 10);
      const sec = parseInt(colonMatch[2], 10);
      if (sec < 60) return m + sec / 60;
    }
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
  }

  const customBpm =
    def.paceSource.kind === "custom"
      ? paceToBpm(def.paceSource.paceMinPerKm)
      : null;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
          Segment {index + 1}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMoveUp(def.id)}
            disabled={index === 0}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMoveDown(def.id)}
            disabled={index === total - 1}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(def.id)}
            disabled={total === 1}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Pace source */}
      <div className="space-y-2">
        <Label className="text-xs">Pace zone</Label>
        <div className="flex flex-wrap gap-2">
          {zones.map((z) => {
            const active = def.paceSource.kind === "zone" && def.paceSource.zoneId === z.id;
            return (
              <button
                key={z.id}
                onClick={() => onChange(def.id, { paceSource: { kind: "zone", zoneId: z.id } })}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                {z.label}
                <span className="ml-1.5 font-mono text-[10px] opacity-70">{z.bpm}</span>
              </button>
            );
          })}
          <button
            onClick={() =>
              onChange(def.id, {
                paceSource: { kind: "custom", paceMinPerKm: parseCustomPace(customPaceStr) ?? 6 },
              })
            }
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              def.paceSource.kind === "custom"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-foreground/30"
            }`}
          >
            Custom
          </button>
        </div>
        {def.paceSource.kind === "custom" && (
          <div className="flex items-center gap-3 mt-2">
            <Input
              className="font-mono w-28 h-8 text-sm"
              placeholder="5:30"
              value={customPaceStr}
              onChange={(e) => {
                setCustomPaceStr(e.target.value);
                const p = parseCustomPace(e.target.value);
                if (p) onChange(def.id, { paceSource: { kind: "custom", paceMinPerKm: p } });
              }}
            />
            <span className="text-xs text-muted-foreground">/km</span>
            {customBpm !== null && (
              <span className="font-mono text-xs text-primary">= {customBpm} BPM</span>
            )}
          </div>
        )}
      </div>

      {/* Length */}
      <div className="space-y-2">
        <Tabs
          value={def.lengthMode}
          onValueChange={(v) => onChange(def.id, { lengthMode: v as "duration" | "distance" })}
        >
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="duration" className="text-xs">Duration</TabsTrigger>
            <TabsTrigger value="distance" className="text-xs">Distance</TabsTrigger>
          </TabsList>
          <TabsContent value="duration" className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <Label className="text-xs">Length</Label>
              <span className="font-mono text-sm text-primary">{def.durationMin} min</span>
            </div>
            <Slider
              min={5}
              max={60}
              step={5}
              value={[def.durationMin]}
              onValueChange={(v) => onChange(def.id, { durationMin: v[0] })}
            />
          </TabsContent>
          <TabsContent value="distance" className="mt-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <Label className="text-xs">Distance</Label>
              <span className="font-mono text-sm text-primary">{def.distanceMi.toFixed(1)} mi</span>
            </div>
            <Slider
              min={0.5}
              max={20}
              step={0.5}
              value={[def.distanceMi]}
              onValueChange={(v) => onChange(def.id, { distanceMi: v[0] })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const RACE_PRESETS: { id: RaceDistancePreset; label: string }[] = [
  { id: "5k", label: "5K" },
  { id: "10k", label: "10K" },
  { id: "half", label: "Half" },
  { id: "marathon", label: "Marathon" },
  { id: "custom", label: "Custom" },
];

const RAMP_OPTIONS: { value: RampMode; label: string; desc: string }[] = [
  { value: "even", label: "Even Pace", desc: "Same BPM throughout" },
  { value: "negative", label: "Negative Split", desc: "Speed up as you go" },
  { value: "positive", label: "Positive Split", desc: "Start fast, ease off" },
];

function RacePacePanel({
  config,
  onChange,
  segments,
}: {
  config: RaceConfig;
  onChange: (c: RaceConfig) => void;
  segments: RunSegment[];
}) {
  const pace = formatGoalPace(config);
  return (
    <div className="space-y-5">
      {/* Distance preset */}
      <div className="space-y-2">
        <Label>Race distance</Label>
        <div className="flex flex-wrap gap-2">
          {RACE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange({ ...config, distancePreset: p.id })}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                config.distancePreset === p.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {config.distancePreset === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              type="number"
              min={1}
              max={200}
              className="font-mono w-24 h-8 text-sm"
              value={config.customDistanceKm}
              onChange={(e) => onChange({ ...config, customDistanceKm: Number(e.target.value) || 10 })}
            />
            <span className="text-xs text-muted-foreground">km</span>
          </div>
        )}
      </div>

      {/* Goal time */}
      <div className="space-y-2">
        <Label>Goal finish time</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={9}
            className="font-mono w-16 h-8 text-sm text-center"
            value={config.goalHours}
            onChange={(e) => onChange({ ...config, goalHours: Math.min(9, Math.max(0, Number(e.target.value) || 0)) })}
          />
          <span className="text-muted-foreground text-sm">h</span>
          <Input
            type="number"
            min={0}
            max={59}
            className="font-mono w-16 h-8 text-sm text-center"
            value={config.goalMinutes}
            onChange={(e) => onChange({ ...config, goalMinutes: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
          />
          <span className="text-muted-foreground text-sm">m</span>
          <Input
            type="number"
            min={0}
            max={59}
            className="font-mono w-16 h-8 text-sm text-center"
            value={config.goalSeconds}
            onChange={(e) => onChange({ ...config, goalSeconds: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
          />
          <span className="text-muted-foreground text-sm">s</span>
        </div>
        {pace ? (
          <div className="font-mono text-sm text-primary">
            {pace.minPerMi} · {pace.minPerKm}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Enter a goal time to see your target pace</div>
        )}
      </div>

      {/* Ramp mode */}
      <div className="space-y-2">
        <Label>Pacing strategy</Label>
        <div className="flex flex-wrap gap-2">
          {RAMP_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => onChange({ ...config, rampMode: r.value })}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                config.rampMode === r.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-[11px] opacity-70">{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ramp controls */}
      {config.rampMode !== "even" && (
        <div className="space-y-4 rounded-xl border border-border bg-surface/40 p-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>BPM spread</Label>
              <span className="font-mono text-sm text-primary">±{config.rampIntensityPct}%</span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[config.rampIntensityPct]}
              onValueChange={(v) => onChange({ ...config, rampIntensityPct: v[0] })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>Music segments</Label>
              <span className="font-mono text-sm text-primary">{config.numRaceSegments}</span>
            </div>
            <Slider
              min={3}
              max={8}
              step={1}
              value={[config.numRaceSegments]}
              onValueChange={(v) => onChange({ ...config, numRaceSegments: v[0] })}
            />
          </div>
        </div>
      )}

      {/* Segment preview */}
      {segments.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Segment breakdown</Label>
          <div className="space-y-1 rounded-lg border border-border divide-y divide-border/50">
            {segments.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-mono text-primary">{s.targetBpm} BPM · {Math.round(s.durationMin)} min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaceStep({
  zones,
  selected,
  onSelect,
  lengthMode,
  setLengthMode,
  durationMin,
  setDurationMin,
  distanceKm,
  setDistanceKm,
  tolerance,
  setTolerance,
  paceMode,
  setPaceMode,
  workoutSegments,
  onAddSegment,
  onUpdateSegment,
  onMoveSegment,
  onDeleteSegment,
  raceConfig,
  setRaceConfig,
  segments,
  onBack,
  onNext,
}: {
  zones: PaceZone[];
  selected: PaceZone | null;
  onSelect: (z: PaceZone) => void;
  lengthMode: "duration" | "distance";
  setLengthMode: (m: "duration" | "distance") => void;
  durationMin: number;
  setDurationMin: (n: number) => void;
  distanceKm: number;
  setDistanceKm: (n: number) => void;
  tolerance: number;
  setTolerance: (n: number) => void;
  paceMode: PaceMode;
  setPaceMode: (m: PaceMode) => void;
  workoutSegments: WorkoutSegmentDef[];
  onAddSegment: () => void;
  onUpdateSegment: (id: string, patch: Partial<WorkoutSegmentDef>) => void;
  onMoveSegment: (id: string, dir: -1 | 1) => void;
  onDeleteSegment: (id: string) => void;
  raceConfig: RaceConfig;
  setRaceConfig: (c: RaceConfig) => void;
  segments: RunSegment[];
  onBack: () => void;
  onNext: () => void;
}) {
  const canProceed =
    paceMode === "simple"
      ? selected !== null
      : paceMode === "workout"
      ? segments.length > 0 && segments.every((s) => s.durationMin > 0)
      : segments.length > 0;

  const totalWorkoutMin = segments.reduce((s, seg) => s + seg.durationMin, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">Configure your run</CardTitle>
        <CardDescription>Choose a run style and set your pace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={paceMode} onValueChange={(v) => setPaceMode(v as PaceMode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="simple" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Quick Run
            </TabsTrigger>
            <TabsTrigger value="workout" className="gap-1.5">
              <Timer className="h-3.5 w-3.5" /> Workout
            </TabsTrigger>
            <TabsTrigger value="race" className="gap-1.5">
              <Flag className="h-3.5 w-3.5" /> Race Pace
            </TabsTrigger>
          </TabsList>

          {/* ── Simple tab ── */}
          <TabsContent value="simple" className="mt-6 space-y-6">
            <ZoneGrid zones={zones} selected={selected} onSelect={onSelect} />
            <LengthPicker
              zones={zones}
              selected={selected}
              lengthMode={lengthMode}
              setLengthMode={setLengthMode}
              durationMin={durationMin}
              setDurationMin={setDurationMin}
              distanceKm={distanceKm}
              setDistanceKm={setDistanceKm}
            />
          </TabsContent>

          {/* ── Workout tab ── */}
          <TabsContent value="workout" className="mt-6 space-y-4">
            {workoutSegments.map((def, i) => (
              <WorkoutSegmentRow
                key={def.id}
                index={i}
                def={def}
                total={workoutSegments.length}
                zones={zones}
                onChange={onUpdateSegment}
                onMoveUp={(id) => onMoveSegment(id, -1)}
                onMoveDown={(id) => onMoveSegment(id, 1)}
                onDelete={onDeleteSegment}
              />
            ))}
            <Button variant="outline" className="w-full" onClick={onAddSegment}>
              + Add Segment
            </Button>
            {segments.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-surface/20 px-4 py-2 text-xs text-muted-foreground">
                Total: <span className="font-mono text-foreground">{Math.round(totalWorkoutMin)} min</span> across{" "}
                <span className="font-mono text-foreground">{segments.length}</span> segments
              </div>
            )}
          </TabsContent>

          {/* ── Race tab ── */}
          <TabsContent value="race" className="mt-6">
            <RacePacePanel config={raceConfig} onChange={setRaceConfig} segments={segments} />
          </TabsContent>
        </Tabs>

        {/* BPM Tolerance — shared across all modes */}
        <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-4">
          <div className="flex items-baseline justify-between">
            <Label>BPM tolerance</Label>
            <span className="font-mono text-sm text-primary">±{tolerance}</span>
          </div>
          <Slider min={2} max={12} step={1} value={[tolerance]} onValueChange={(v) => setTolerance(v[0])} />
          <p className="text-xs text-muted-foreground">
            Wider = more tracks to choose from. Tighter = stricter cadence match.
          </p>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={!canProceed} variant="hero" size="lg">
            Next: pick music <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceStep({
  currentUserId,
  source,
  onChange,
  onBack,
  onNext,
}: {
  currentUserId: string | null;
  source: Source | null;
  onChange: (s: Source) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyPlaylists(50)
      .then((p) => {
        if (cancelled) return;
        const safe = (p ?? [])
          .filter((x): x is SpotifyPlaylist => !!x && !!x.id)
          .filter((x) => isReadablePlaylist(x, currentUserId));
        setPlaylists(safe);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("getMyPlaylists failed:", e);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentUserId]);

  const isActive = (s: Source) =>
    source?.kind === s.kind && (s.kind === "liked" || (source.kind === "playlist" && source.id === s.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">Pick a playlist to draw from</CardTitle>
        <CardDescription>We'll pull tracks from this source and match them to your target tempo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading your playlists…
          </div>
        )}
        {error && (
          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive break-words font-mono">
            <div>{error}</div>
            {error.toLowerCase().includes("reconnect spotify") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearAuth();
                  window.location.href = "/";
                }}
              >
                Reconnect Spotify
              </Button>
            )}
          </div>
        )}
        {!loading && !error && (
          <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border border-border">
            <button
              onClick={() => onChange({ kind: "liked" })}
              className={`flex w-full items-center gap-3 border-b border-border/40 p-3 text-left transition-colors ${
                isActive({ kind: "liked" }) ? "bg-primary/10" : "hover:bg-surface/40"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/20">
                <Music className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">Liked Songs</div>
                <div className="truncate text-xs text-muted-foreground">Your saved tracks</div>
              </div>
            </button>
            {playlists.map((p) => {
              const active = isActive({ kind: "playlist", id: p.id, name: p.name });
              return (
                <button
                  key={p.id}
                  onClick={() => onChange({ kind: "playlist", id: p.id, name: p.name })}
                  className={`flex w-full items-center gap-3 border-b border-border/40 p-3 text-left transition-colors last:border-b-0 ${
                    active ? "bg-primary/10" : "hover:bg-surface/40"
                  }`}
                >
                  <img
                    src={p.images?.[0]?.url ?? ""}
                    alt=""
                    className="h-12 w-12 rounded bg-muted object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name ?? "Untitled playlist"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.tracks?.total ?? 0} tracks{p.owner?.display_name ? ` · ${p.owner.display_name}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={!source} variant="hero" size="lg">
            Build playlist <Wand2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GenerateStep({
  me,
  segments,
  source,
  tolerance,
  onRestart,
}: {
  me: SpotifyUser;
  segments: RunSegment[];
  source: Source;
  tolerance: number;
  onRestart: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "analyzing" | "ready" | "saving" | "saved" | "error">("loading");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [analyzed, setAnalyzed] = useState<AnalyzedTrack[]>([]);
  const [picked, setPicked] = useState<AnalyzedTrack[]>([]);
  const [segmentSizes, setSegmentSizes] = useState<number[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const sourceLabel = source.kind === "liked" ? "Liked Songs" : source.name;
  const isMultiSegment = segments.length > 1;
  const totalTargetMin = segments.reduce((s, seg) => s + seg.durationMin, 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPhase("loading");
        const pool: SpotifyTrack[] = source.kind === "liked"
          ? await getMyLikedTracks(1000)
          : await getPlaylistTracks(source.id, 1000);
        if (cancelled) return;
        const map = new Map<string, SpotifyTrack>();
        pool.forEach((t) => t && map.set(t.id, t));
        const deduped = Array.from(map.values());
        setProgress({ done: 0, total: deduped.length });
        setPhase("analyzing");
        const results = await analyzeTracks(deduped, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        }, 4);
        if (cancelled) return;
        setAnalyzed(results);
        const { tracks: chosen, segmentSizes: sizes } = pickForSegments(results, segments, tolerance);
        setPicked(chosen);
        setSegmentSizes(sizes);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getSegmentForIndex(trackIdx: number): number {
    let count = 0;
    for (let s = 0; s < segmentSizes.length; s++) {
      count += segmentSizes[s];
      if (trackIdx < count) return s;
    }
    return Math.max(0, segmentSizes.length - 1);
  }

  function getSegmentBounds(segIdx: number): [number, number] {
    const start = segmentSizes.slice(0, segIdx).reduce((a, b) => a + b, 0);
    return [start, start + segmentSizes[segIdx]];
  }

  function reshuffle() {
    const { tracks: chosen, segmentSizes: sizes } = pickForSegments(analyzed, segments, tolerance);
    setPicked(chosen);
    setSegmentSizes(sizes);
  }

  function replaceTrack(trackIdx: number) {
    const segIdx = isMultiSegment ? getSegmentForIndex(trackIdx) : 0;
    const seg = segments[segIdx];
    // Exclude ALL currently picked tracks so we always get a genuinely different song
    const currentIds = new Set(picked.map((p) => p.track.id));

    const findCandidate = (tol: number) =>
      analyzed.filter(
        (a) =>
          a.bpm !== null &&
          Math.abs(a.bpm - seg.targetBpm) <= tol &&
          !currentIds.has(a.track.id),
      );

    let pool = findCandidate(tolerance);
    // If nothing in range, widen tolerance up to 2× before giving up
    if (pool.length === 0) pool = findCandidate(tolerance * 2);
    if (pool.length === 0) return;

    const replacement = pool[Math.floor(Math.random() * pool.length)];
    const newPicked = [...picked];
    newPicked[trackIdx] = replacement;
    setPicked(newPicked);
  }

  function moveTrack(trackIdx: number, dir: "up" | "down") {
    const targetIdx = dir === "up" ? trackIdx - 1 : trackIdx + 1;
    if (isMultiSegment) {
      const segIdx = getSegmentForIndex(trackIdx);
      const [segStart, segEnd] = getSegmentBounds(segIdx);
      if (targetIdx < segStart || targetIdx >= segEnd) return;
    } else {
      if (targetIdx < 0 || targetIdx >= picked.length) return;
    }
    const newPicked = [...picked];
    [newPicked[trackIdx], newPicked[targetIdx]] = [newPicked[targetIdx], newPicked[trackIdx]];
    setPicked(newPicked);
  }

  const save = async () => {
    setPhase("saving");
    try {
      const name = isMultiSegment
        ? `${segments.length}-Segment Run · ${Math.round(totalMinutes(picked))} min`
        : `${segments[0].label} run · ${segments[0].targetBpm} BPM`;
      const desc = isMultiSegment
        ? `${segments.map((s) => `${s.label}: ${s.targetBpm}bpm`).join(" → ")}. Built with PaceBeat.`
        : `${Math.round(totalMinutes(picked))} min @ ${segments[0].targetBpm}±${tolerance} BPM. Built with PaceBeat.`;
      const pl = await createPlaylist(name, desc);
      await addTracks(pl.id, picked.map((p) => p.track.uri));
      setPlaylistUrl(pl.external_urls.spotify);
      setPhase("saved");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Save failed");
      setPhase("error");
    }
  };

  const matchedCount = analyzed.filter((a) => a.bpm !== null).length;
  const noTempo = analyzed.length - matchedCount;
  const totalMin = totalMinutes(picked);
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const avgBpm = picked.length
    ? Math.round(picked.reduce((s, p) => s + (p.bpm ?? 0), 0) / picked.length)
    : 0;

  // Grouped view for multi-segment: each entry has the segment, its time window, and track+startTime pairs
  const segmentedView = useMemo(() => {
    if (!isMultiSegment || segmentSizes.length === 0 || picked.length === 0) return null;
    let trackIdx = 0;
    let elapsedMs = 0;
    return segments.map((seg, i) => {
      const count = segmentSizes[i] ?? 0;
      const segStartMs = elapsedMs;
      const rows: { track: AnalyzedTrack; startMs: number; globalIdx: number }[] = [];
      for (let j = 0; j < count && trackIdx < picked.length; j++, trackIdx++) {
        rows.push({ track: picked[trackIdx], startMs: elapsedMs, globalIdx: trackIdx });
        elapsedMs += picked[trackIdx].track.duration_ms;
      }
      return { seg, segStartMs, segEndMs: elapsedMs, rows };
    });
  }, [isMultiSegment, segmentSizes, segments, picked]);

  const cardTitle = isMultiSegment
    ? `${segments.length}-Segment Run`
    : `${segments[0]?.label} · ${segments[0]?.targetBpm} BPM`;
  const noMatchMsg = isMultiSegment
    ? `No tracks matched within ±${tolerance} BPM for some segments. Try widening the tolerance.`
    : `No tracks fell inside ±${tolerance} BPM of ${segments[0]?.targetBpm}. Try widening the tolerance or picking a different playlist.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">{cardTitle}</CardTitle>
        <CardDescription>
          Target {Math.round(totalTargetMin)} min · from: {sourceLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(phase === "loading" || phase === "analyzing") && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {phase === "loading" ? "Loading tracks…" : `Detecting tempo… ${progress.done}/${progress.total}`}
            </div>
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">
              We look up each track's tempo on Deezer (by ISRC) and analyze the preview when needed. This takes a moment.
            </p>
          </div>
        )}

        {phase === "ready" && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Tracks" value={picked.length.toString()} />
              <Stat label="Length" value={`${Math.round(totalMin)}m`} />
              {isMultiSegment ? (
                <Stat label="Segments" value={segments.length.toString()} />
              ) : (
                <Stat label="Avg BPM" value={avgBpm ? avgBpm.toString() : "—"} />
              )}
            </div>
            {picked.length === 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                {noMatchMsg}
                <p className="mt-2 text-xs text-muted-foreground">
                  Analyzed {analyzed.length} tracks · {matchedCount} had tempo data · {noTempo} skipped (no tempo found).
                </p>
              </div>
            ) : segmentedView ? (
              // Multi-segment grouped view
              <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border">
                {segmentedView.map(({ seg, segStartMs, segEndMs, rows }, si) => (
                  <div key={seg.id}>
                    {/* Segment header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-muted/80 px-3 py-2 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                          {si + 1}
                        </span>
                        <span className="text-sm font-semibold">{seg.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">{seg.targetBpm} BPM</span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {fmtTime(segStartMs)}–{fmtTime(segEndMs)}
                      </span>
                    </div>
                    {/* Tracks in this segment */}
                    {rows.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">
                        No matching tracks for this segment — try widening tolerance.
                      </div>
                    ) : (
                      rows.map(({ track: p, startMs, globalIdx }, rowIdx) => (
                        <div key={p.track.id} className="group flex items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0">
                          <span className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTime(startMs)}</span>
                          <img
                            src={p.track.album.images?.[2]?.url ?? p.track.album.images?.[0]?.url ?? ""}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded bg-muted object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{p.track.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {p.track.artists.map((a) => a.name).join(", ")}
                            </div>
                          </div>
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {fmtMs(p.track.duration_ms)}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => moveTrack(globalIdx, "up")}
                              disabled={rowIdx === 0}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => moveTrack(globalIdx, "down")}
                              disabled={rowIdx === rows.length - 1}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => replaceTrack(globalIdx)}
                              title="Replace with a different track"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Single-segment flat view
              <div className="space-y-1 max-h-96 overflow-y-auto rounded-lg border border-border">
                {picked.map((p, i) => (
                  <div key={p.track.id} className="group flex items-center gap-3 border-b border-border/40 p-2 last:border-b-0">
                    <span className="w-6 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <img
                      src={p.track.album.images?.[2]?.url ?? p.track.album.images?.[0]?.url ?? ""}
                      alt=""
                      className="h-10 w-10 rounded bg-muted object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.track.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.track.artists.map((a) => a.name).join(", ")}
                      </div>
                    </div>
                    <div className="font-mono text-sm text-primary">{Math.round(p.bpm ?? 0)}</div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => moveTrack(i, "up")}
                        disabled={i === 0}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => moveTrack(i, "down")}
                        disabled={i === picked.length - 1}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => replaceTrack(i)}
                        title="Replace with a different track"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Matched {picked.length} of {matchedCount} analyzable tracks. {noTempo > 0 && `${noTempo} skipped (no tempo data).`}
            </p>
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={onRestart}>Adjust pace</Button>
              <Button variant="outline" onClick={reshuffle} disabled={analyzed.length === 0}>
                <Shuffle className="h-4 w-4" /> Reshuffle
              </Button>
              <Button variant="hero" size="lg" onClick={save} disabled={picked.length === 0}>
                Save to Spotify <Music className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {phase === "saving" && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Saving playlist…
          </div>
        )}

        {phase === "saved" && playlistUrl && (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto inline-flex items-center justify-center rounded-full bg-primary/15 p-4">
              <Music className="h-8 w-8 text-primary" />
            </div>
            <div className="font-display text-2xl font-bold">Saved to your Spotify.</div>
            <Button asChild variant="hero" size="lg">
              <a href={playlistUrl} target="_blank" rel="noreferrer">
                Open playlist <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <div>
              <Button variant="ghost" onClick={onRestart}>Build another</Button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <div>{errorMsg}</div>
              <div className="rounded-md border border-border/60 bg-background/70 p-3 font-mono text-xs text-muted-foreground break-all">
                <div>Connected Spotify user: {me.display_name || "—"}</div>
                <div>Spotify user ID: {me.id || "—"}</div>
                <div>Spotify account email: {me.email || "(Spotify did not return one)"}</div>
                <div>Client ID in app: {typeof window !== "undefined" ? window.localStorage.getItem("rb_spotify_client_id") ?? "—" : "—"}</div>
              </div>
            </div>
            <Button variant="ghost" onClick={onRestart}>Try again</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 py-3">
      <div className="font-display text-2xl font-bold text-primary">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
