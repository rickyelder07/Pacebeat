import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeZones,
  formatPace,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
  kmToMi,
  miToKm,
  type Fitness,
  type PaceZone,
  type Profile,
  type Sex,
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
import { analyzeTracks, pickForRun, totalMinutes, type AnalyzedTrack } from "@/lib/bpm";
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
import { Activity, Gauge, Music, ArrowRight, Loader2, ExternalLink, Search, Wand2 } from "lucide-react";

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

  useEffect(() => {
    if (authed && !me && !meLoading) loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const zones = useMemo(() => computeZones(profile), [profile]);

  const targetMinutes =
    lengthMode === "duration" ? durationMin : (zone ? distanceKm * zone.paceMinPerKm : distanceKm * 6);

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
            zone && source && me ? (
              <GenerateStep
                me={me}
                zone={zone}
                source={source}
                targetMinutes={targetMinutes}
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
                      : !zone
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
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">Pick your pace</CardTitle>
        <CardDescription>Zones are estimated from your profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <Button onClick={onNext} disabled={!selected} variant="hero" size="lg">
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
  zone,
  source,
  targetMinutes,
  tolerance,
  onRestart,
}: {
  me: SpotifyUser;
  zone: PaceZone;
  source: Source;
  targetMinutes: number;
  tolerance: number;
  onRestart: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "analyzing" | "ready" | "saving" | "saved" | "error">("loading");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [analyzed, setAnalyzed] = useState<AnalyzedTrack[]>([]);
  const [picked, setPicked] = useState<AnalyzedTrack[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const sourceLabel = source.kind === "liked" ? "Liked Songs" : source.name;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPhase("loading");
        const pool: SpotifyTrack[] = source.kind === "liked"
          ? await getMyLikedTracks(1000)
          : await getPlaylistTracks(source.id, 1000);
        if (cancelled) return;
        // dedupe by id
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
        const chosen = pickForRun(results, zone.bpm, tolerance, targetMinutes);
        setPicked(chosen);
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

  const save = async () => {
    setPhase("saving");
    try {
      const name = `${zone.label} run · ${zone.bpm} BPM`;
      const desc = `${Math.round(totalMinutes(picked))} min @ ${zone.bpm}±${tolerance} BPM. Built with PaceBeat.`;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl">
          {zone.label} · {zone.bpm} BPM
        </CardTitle>
        <CardDescription>
          Target {Math.round(targetMinutes)} min · from: {sourceLabel}
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
              <Stat label="Avg BPM" value={picked.length ? Math.round(picked.reduce((s, p) => s + (p.bpm ?? 0), 0) / picked.length).toString() : "—"} />
            </div>
            {picked.length === 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                No tracks fell inside ±{tolerance} BPM of {zone.bpm}. Try widening the tolerance or picking a different playlist.
                <p className="mt-2 text-xs text-muted-foreground">
                  Analyzed {analyzed.length} tracks · {matchedCount} had tempo data · {noTempo} skipped (no tempo found).
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto rounded-lg border border-border">
                {picked.map((p, i) => (
                  <div key={p.track.id} className="flex items-center gap-3 border-b border-border/40 p-2 last:border-b-0">
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
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Matched {picked.length} of {matchedCount} analyzable tracks. {noTempo > 0 && `${noTempo} skipped (no tempo data).`}
            </p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={onRestart}>Adjust pace</Button>
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
