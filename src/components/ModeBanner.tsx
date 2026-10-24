"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

interface Mode { mode: string; missing?: string[]; invalid?: string[] }

export default function ModeBanner() {
  const [m, setM] = useState<Mode | null>(null);
  useEffect(() => { api<Mode>("/api/v1/mode").then(setM).catch(() => setM(null)); }, []);
  if (m?.mode !== "unconfigured") return null;
  const names = [...(m.missing ?? []), ...(m.invalid ?? [])];
  return (
    <div role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-medium text-white">
      Bab Ride is not configured. Booking and sign-in are unavailable.
      {names.length > 0 && <> Check: <span className="font-mono">{names.join(", ")}</span></>}
    </div>
  );
}
