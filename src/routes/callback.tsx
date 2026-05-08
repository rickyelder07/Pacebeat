import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exchangeCode } from "@/lib/spotify";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/callback")({
  component: Callback,
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
});

function Callback() {
  const { code, error } = Route.useSearch();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Connecting to Spotify…");

  useEffect(() => {
    if (error) {
      setMsg(`Spotify error: ${error}`);
      return;
    }
    if (!code) {
      setMsg("Missing authorization code.");
      return;
    }
    exchangeCode(code)
      .then(() => navigate({ to: "/build" }))
      .catch((e) => setMsg(e.message ?? "Token exchange failed"));
  }, [code, error, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <Activity className="mx-auto h-10 w-10 text-primary animate-pulse" />
        <p className="mt-4 font-mono text-sm text-muted-foreground">{msg}</p>
      </div>
    </div>
  );
}
