"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { SELECT_DESTINATION_EVENT, type Landmark } from "./types";

export default function CampusDestinations() {
  const [lms, setLms] = useState<Landmark[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ landmarks: Landmark[] }>("/api/v1/campus/landmarks").then((r) => setLms(r.landmarks.filter((l) => l.destinationAllowed))).catch((e: Error) => setErr(e.message)); }, []);

  function choose(id: string) {
    window.dispatchEvent(new CustomEvent(SELECT_DESTINATION_EVENT, { detail: id }));
    document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (err) return <p role="alert" className="rounded-xl bg-white p-4 text-navy-800">Landmarks could not be loaded: {err}</p>;
  if (!lms) return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Loading landmarks">{Array.from({ length: 4 }, (_, i) => <li key={i} className="skeleton h-16 rounded-xl bg-navy-100" />)}</ul>;
  if (lms.length === 0) return <p className="rounded-xl bg-white p-4 text-navy-800">No campus landmarks have been added yet.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {lms.map((l) => (
        <li key={l.id}>
          <button type="button" onClick={() => choose(l.id)} className="group flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-navy-100 bg-white px-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-royal/40 hover:shadow-md">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent/20" />
            <span className="font-semibold text-navy-950">{l.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
