import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Music, Gauge, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SpotifyConnectButton } from "@/components/spotify-connect";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "PaceBeat — Spotify playlists tuned to your running pace" },
      {
        name: "description",
        content:
          "Generate Spotify running playlists that match track BPM to your target pace. Built for runners.",
      },
    ],
  }),
});

function Index() {
  const { authed, ready } = useAuthState();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-30" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-32">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <span className="pulse-dot" />
                Built for runners
              </div>
              <h1 className="mt-6 font-display text-5xl font-bold leading-[0.95] tracking-tight text-balance md:text-7xl lg:text-8xl">
                Run to the{" "}
                <span className="text-primary">beat</span>
                <br />
                of your <span className="italic font-light">pace</span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
                PaceBeat builds Spotify playlists where every track's BPM matches your target running cadence — from easy long runs to interval sessions.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                {ready && authed ? (
                  <Button asChild size="xl" variant="hero">
                    <Link to="/build">
                      <Zap className="h-5 w-5" />
                      Build a playlist
                    </Link>
                  </Button>
                ) : (
                  <SpotifyConnectButton className="h-14 px-10 text-base rounded-xl" />
                )}
                <a
                  href="#how"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
                >
                  How it works ↓
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Three steps. One perfect run.
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <Feature
                n="01"
                icon={<Activity className="h-6 w-6" />}
                title="Tell us about you"
                body="Age, height, weight, fitness level. We compute your easy / tempo / interval pace zones and the cadence (BPM) that matches each."
              />
              <Feature
                n="02"
                icon={<Gauge className="h-6 w-6" />}
                title="Pick your run"
                body="Choose a pace zone and run by duration or distance. Then narrow tracks to a genre or your favorite artist."
              />
              <Feature
                n="03"
                icon={<Music className="h-6 w-6" />}
                title="Save to Spotify"
                body="We analyze BPM from track previews and assemble a playlist that fills your run length — saved straight to your library."
              />
            </div>
          </div>
        </section>

        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 text-xs text-muted-foreground font-mono">
            PACEBEAT · BPM detected from Spotify preview clips · Not affiliated with Spotify
          </div>
        </footer>
      </main>
    </div>
  );
}

function Feature({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="group relative rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <div className="text-primary">{icon}</div>
      </div>
      <h3 className="mt-6 font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
