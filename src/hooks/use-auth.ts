import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isAuthed } from "@/lib/spotify";

export function useAuthState() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setAuthed(isAuthed());
    setReady(true);
    const onStorage = () => setAuthed(isAuthed());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { authed, ready, refresh: () => setAuthed(isAuthed()) };
}

export function useRequireAuth() {
  const navigate = useNavigate();
  const { authed, ready } = useAuthState();
  useEffect(() => {
    if (ready && !authed) navigate({ to: "/" });
  }, [ready, authed, navigate]);
  return authed;
}
