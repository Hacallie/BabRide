"use client";
import { useRef, useState } from "react";
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
 * Admin location picker. Find a place by name (campus-first search, campus-only results), use your current GPS position,
 * or type coordinates you already know. Check the marker on the map preview and fine-tune it in 10 m steps.
 * Choosing a point here only "selects" a location; it never marks it ground verified.
 *
 * IMPORTANT: this component deliberately contains NO form element. It is rendered inside the "Add landmark" form, and a form nested
 * inside a form is invalid HTML: the browser drops the inner one, so the Search button submitted the OUTER form and the page reloaded.
 * The Search button is type="button" and Enter in the box is handled explicitly.
 */
export default function LocationPicker({ value, onChange, idPrefix = "lp", initialQuery = "" }: { value: Picked | null; onChange: (p: Picked | null) => void; idPrefix?: string; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery); const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [lat, setLat] = useState(""); const [lng, setLng] = useState("");
  const latest = useRef(0); // ignore a slow answer to an older search

  async function search() {
    if (busy) return;
    if (q.trim().length < 3) return setMsg({ kind: "error", text: "Type at least 3 characters to search." });
    const mine = ++latest.current;
    setBusy(true); setMsg(null); setResults(null); setHidden(0);
    try {
      const r = await api<{ candidates: Candidate[]; filteredOut?: number }>(`/api/v1/admin/geocode?q=${encodeURIComponent(q.trim())}`);
      if (mine !== latest.current) return;
      setResults(r.candidates); setHidden(r.filteredOut ?? 0);
      if (r.candidates.length === 0) setMsg({ kind: "info", text: r.filteredOut ? "Only places outside the campus were found, so they were hidden. Try another spelling, use your GPS position, or type the coordinates." : "No matches. Try a different spelling, use your current GPS position, or type the coordinates." });
    } catch (x) { if (mine === latest.current) setMsg({ kind: "error", text: x instanceof Error ? x.message : "Search failed." }); }
    finally { if (mine === latest.current) setBusy(false); }
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
  function useTyped() {
    const la = Number(lat.trim()), lo = Number(lng.trim());
    if (lat.trim() === "" || lng.trim() === "" || !validPoint(la, lo)) return setMsg({ kind: "error", text: "Enter a valid latitude (-90 to 90) and longitude (-180 to 180). 0, 0 is not a real campus location." });
    onChange({ latitude: Number(la.toFixed(6)), longitude: Number(lo.toFixed(6)), source: "map" });
    setMsg({ kind: "info", text: "Coordinates set. Check the map preview, then save." });
  }
  const choose = (c: Candidate) => { onChange({ latitude: Number(c.latitude.toFixed(6)), longitude: Number(c.longitude.toFixed(6)), source: "search" }); setResults(null); setMsg(null); };
  const move = (d: Dir) => { if (value) onChange({ ...nudge(value.latitude, value.longitude, d, 10), source: "map" }); };

  return (
    <div className="space-y-3" role="group" aria-label="Choose the landmark's position">
      <div className="space-y-2">
        <label className={label} htmlFor={`${idPrefix}-q`}>Find the place</label>
        <div className="flex gap-2">
          <input id={`${idPrefix}-q`} type="search" enterKeyHint="search" className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. a building or hall name" autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />
          <button type="button" onClick={() => void search()} className={`${btnGhost} shrink-0`} disabled={busy} aria-busy={busy}>{busy ? "Searching…" : "Search"}</button>
        </div>
        <button type="button" onClick={gps} className={`${btnGhost} w-full`}>Use my current location</button>
      </div>

      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-800" : "bg-navy-50 text-navy-800"}`}>{msg.text}</p>}

      {results && results.length > 0 && (
        <div>
          <ul className="space-y-1" aria-label="Search results (campus only)">
            {results.map((c, i) => (
              <li key={`${c.latitude},${c.longitude},${i}`}>
                <button type="button" onClick={() => choose(c)} className="min-h-[48px] w-full rounded-xl border border-navy-100 bg-white px-3 py-2 text-left text-sm hover:bg-navy-50">{c.label}</button>
              </li>))}
          </ul>
          {hidden > 0 && <p className="mt-1 text-xs text-navy-700">{hidden} result{hidden === 1 ? "" : "s"} outside the campus {hidden === 1 ? "was" : "were"} hidden.</p>}
        </div>)}

      <details className="rounded-xl border border-navy-100 p-3">
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-medium">Know the coordinates? Type them</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div><label className={label} htmlFor={`${idPrefix}-lat`}>Latitude</label><input id={`${idPrefix}-lat`} inputMode="decimal" className={input} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 6.89" /></div>
          <div><label className={label} htmlFor={`${idPrefix}-lng`}>Longitude</label><input id={`${idPrefix}-lng`} inputMode="decimal" className={input} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. 3.72" /></div>
        </div>
        <button type="button" onClick={useTyped} className={`${btnGhost} mt-2 w-full`}>Use these coordinates</button>
        <p className="mt-1 text-xs text-navy-700">Copy them from a map you trust (long-press a spot on your phone's map app). Never guess.</p>
      </details>

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
              <p className="text-xs text-navy-700">{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</p>
              <a className="underline" href={osmLargeUrl(value.latitude, value.longitude)} target="_blank" rel="noreferrer noopener">Open a larger map</a>
              {" · "}<button type="button" className="underline" onClick={() => onChange(null)}>Clear</button>
            </div>
          </div>
        </div>
      ) : <p className="text-sm text-navy-700">No location chosen yet. Search for the place, use your current location, or type the coordinates.</p>}
    </div>
  );
}
