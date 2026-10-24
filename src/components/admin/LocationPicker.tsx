"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { btnGhost, input, label } from "@/components/ui";
import { nudge, osmEmbedUrl, osmLargeUrl, validPoint, type Dir } from "@/lib/geo-pick";

export interface Picked { latitude: number; longitude: number; source: "search" | "gps" | "map" }
interface Candidate { label: string; latitude: number; longitude: number }

const ARIA: Record<Dir, string> = {
  north: "Move pin 10 metres north", south: "Move pin 10 metres south", east: "Move pin 10 metres east", west: "Move pin 10 metres west",
};
const PAD = "!min-h-[44px] !px-4";

/**
 * Admin location picker. No coordinates are typed. Find a place by name (server-side search, if the owner enabled it) or use
 * your current GPS position, check the marker on the map preview, and fine-tune it in 10 m steps.
 * Choosing a point here only "selects" a location; it never marks it ground verified.
 */
export default function LocationPicker({ value, onChange, idPrefix = "lp" }: { value: Picked | null; onChange: (p: Picked | null) => void; idPrefix?: string }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (q.trim().length < 3) return setMsg({ kind: "error", text: "Type at least 3 characters to search." });
    setBusy(true); setMsg(null); setResults(null);
    try {
      const r = await api<{ candidates: Candidate[] }>(`/api/v1/admin/geocode?q=${encodeURIComponent(q.trim())}`);
      setResults(r.candidates);
      if (r.candidates.length === 0) setMsg({ kind: "info", text: "No matches. Try a different spelling, or use your current GPS position." });
    } catch (x) { setMsg({ kind: "error", text: x instanceof Error ? x.message : "Search failed." }); }
    finally { setBusy(false); }
  }
  function gps() {
    setMsg(null);
    if (!("geolocation" in navigator)) return setMsg({ kind: "error", text: "This device can't share its location. Use search instead." });
    setMsg({ kind: "info", text: "Getting your position…" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude, longitude } = p.coords;
        if (!validPoint(latitude, longitude)) return setMsg({ kind: "error", text: "That position doesn't look valid. Try again outdoors." });
        onChange({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)), source: "gps" });
        setMsg({ kind: "info", text: `Position set (accuracy about ${Math.round(p.coords.accuracy)} m). Check the map, then fine-tune if needed.` });
      },
      () => setMsg({ kind: "error", text: "Location permission was denied or unavailable. Use search instead." }),
      { enableHighAccuracy: true, timeout: 15000 });
  }
  const choose = (c: Candidate) => { onChange({ latitude: Number(c.latitude.toFixed(6)), longitude: Number(c.longitude.toFixed(6)), source: "search" }); setResults(null); setMsg(null); };
  const move = (d: Dir) => { if (value) onChange({ ...nudge(value.latitude, value.longitude, d, 10), source: "map" }); };

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="space-y-2">
        <label className={label} htmlFor={`${idPrefix}-q`}>Find the place</label>
        <div className="flex gap-2">
          <input id={`${idPrefix}-q`} className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. a building or hall name" autoComplete="off" />
          <button className={`${btnGhost} shrink-0`} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        </div>
        <button type="button" onClick={gps} className={`${btnGhost} w-full`}>Use my current location</button>
      </form>

      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-800" : "bg-navy-50 text-navy-800"}`}>{msg.text}</p>}

      {results && results.length > 0 && (
        <ul className="space-y-1" aria-label="Search results">
          {results.map((c, i) => (
            <li key={`${c.latitude},${c.longitude},${i}`}>
              <button type="button" onClick={() => choose(c)} className="min-h-[48px] w-full rounded-xl border border-navy-100 bg-white px-3 py-2 text-left text-sm hover:bg-navy-50">{c.label}</button>
            </li>))}
        </ul>)}

      {value ? (
        <div className="space-y-2">
          <iframe title="Selected location on the map" src={osmEmbedUrl(value.latitude, value.longitude)} loading="lazy"
            className="h-56 w-full rounded-xl border border-navy-100" referrerPolicy="no-referrer" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Fine-tune the pin">
              <span /><button type="button" aria-label={ARIA.north} onClick={() => move("north")} className={`${btnGhost} ${PAD}`}>↑</button><span />
              <button type="button" aria-label={ARIA.west} onClick={() => move("west")} className={`${btnGhost} ${PAD}`}>←</button>
              <button type="button" aria-label={ARIA.south} onClick={() => move("south")} className={`${btnGhost} ${PAD}`}>↓</button>
              <button type="button" aria-label={ARIA.east} onClick={() => move("east")} className={`${btnGhost} ${PAD}`}>→</button>
            </div>
            <div className="text-sm text-navy-800">
              <p><b>Location selected</b>: not yet checked on the ground.</p>
              <a className="underline" href={osmLargeUrl(value.latitude, value.longitude)} target="_blank" rel="noreferrer noopener">Open a larger map</a>
              {" · "}<button type="button" className="underline" onClick={() => onChange(null)}>Clear</button>
            </div>
          </div>
        </div>
      ) : <p className="text-sm text-navy-700">No location chosen yet. Search for the place or use your current location.</p>}
    </div>
  );
}