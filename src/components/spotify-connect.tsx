import { type MouseEvent, useEffect, useState } from "react";
import { getClientId, setClientId, getRedirectUri, prepareAuthRequest, persistPendingAuth } from "@/lib/spotify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Music, ExternalLink, Copy, Check } from "lucide-react";

export function SpotifyConnectButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(getClientId() ?? "");
  const [copied, setCopied] = useState(false);
  const [preparedAuth, setPreparedAuth] = useState<{ url: string; verifier: string } | null>(null);
  const redirect = typeof window !== "undefined" ? getRedirectUri() : "";
  const authTarget = typeof window !== "undefined" && window.self !== window.top ? "_blank" : "_self";

  useEffect(() => {
    const trimmed = id.trim();
    if (!trimmed) {
      setPreparedAuth(null);
      return;
    }

    let cancelled = false;

    void prepareAuthRequest(trimmed)
      .then((auth) => {
        if (!cancelled) setPreparedAuth(auth);
      })
      .catch(() => {
        if (!cancelled) setPreparedAuth(null);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const canContinue = !!id.trim() && !!preparedAuth;

  const handleContinue = (event: MouseEvent<HTMLAnchorElement>) => {
    const trimmed = id.trim();
    if (!trimmed || !preparedAuth) {
      event.preventDefault();
      return;
    }

    setClientId(trimmed);
    persistPendingAuth(preparedAuth.verifier);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant="hero" className={className}>
          <Music className="h-5 w-5" />
          Connect Spotify
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect your Spotify app</DialogTitle>
          <DialogDescription>
            One-time setup. We never see your password — auth happens directly with Spotify.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li>
            1. Open the{" "}
            <a
              className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Spotify Developer Dashboard <ExternalLink className="h-3 w-3" />
            </a>
            and create an app.
          </li>
          <li>
            2. Add this exact <span className="font-mono text-foreground">Redirect URI</span>:
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
              <code className="flex-1 truncate font-mono text-xs text-foreground">{redirect}</code>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(redirect);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </li>
          <li>3. Copy the app's <span className="font-mono text-foreground">Client ID</span> and paste below.</li>
        </ol>
        <div className="space-y-2">
          <Label htmlFor="client-id">Spotify Client ID</Label>
          <Input
            id="client-id"
            placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="font-mono"
          />
        </div>
        <DialogFooter>
          <Button asChild disabled={!canContinue} variant="hero">
            <a
              href={preparedAuth?.url ?? "#"}
              target={authTarget}
              rel="noopener noreferrer"
              aria-disabled={!canContinue}
              onClick={(event) => {
                handleContinue(event);
              }}
            >
              Continue to Spotify
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
