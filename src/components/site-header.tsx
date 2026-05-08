import { Link, useLocation } from "@tanstack/react-router";
import { Activity, LogOut } from "lucide-react";
import { isAuthed, logout } from "@/lib/spotify";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const location = useLocation();
  const authed = typeof window !== "undefined" && isAuthed();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Activity className="h-6 w-6 text-primary" strokeWidth={2.5} />
            <span className="pulse-dot absolute -right-1 -top-1" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            PACEBEAT
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {authed && location.pathname !== "/build" && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/build">Build playlist</Link>
            </Button>
          )}
          {authed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                window.location.href = "/";
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
