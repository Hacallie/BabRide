"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { btnGhost, input, label } from "@/components/ui";

/**
 * Search box + Search button + results list.
 *
 * Deliberately NOT a <form>. A <form> here caused two real bugs: (1) pressing Search could reload the page when the
 * submit handler was not attached (before hydration) or when a different form caught the event, and (2) when this box sits
 * inside another form (the admin "Add landmark" form), pressing Enter submitted THAT form. With no form element there is
 * nothing to submit natively; Enter and the button both call run() and Enter's default action is always cancelled.
 */
export interface PlaceSearchProps<T> {
  id: string; label: string; placeholder?: string; minLength?: number; tone?: "light" | "dark";
  search: (q: string, signal: AbortSignal) => Promise<T[]>;
  resultKey: (t: T, i: number) => string; renderResult: (t: T) => ReactNode; onSelect: (t: T) => void;
  emptyText?: string;
}

export default function PlaceSearch<T>({ id, label: text, placeholder, minLength = 3, tone = "light", search, resultKey, renderResult, onSelect, emptyText }: PlaceSearchProps<T>) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<T[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const dark = tone === "dark";

  async function run() {
    if (busy) return;
    const term = q.trim();
    if (term.length < minLength) { setResults(null); return setMsg({ kind: "error", text: `Type at least ${minLength} characters to search.` }); }
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c;
    setBusy(true); setMsg(null); setResults(null);
    try {
      const r = await search(term, c.signal);
      if (c.signal.aborted) return;
      setResults(r);
      if (r.length === 0) setMsg({ kind: "info", text: emptyText ?? "No matches. Try a different spelling." });
    } catch (e) {
      if (c.signal.aborted) return;
      setMsg({ kind: "error", text: e instanceof Error && e.message ? e.message : "Search failed. Check your connection and try again." });
    } finally { if (ctl.current === c) setBusy(false); }
  }
  const choose = (t: T) => { onSelect(t); setResults(null); setMsg(null); };

  return (
    <div role="search" aria-label={text} className="space-y-2">
      <label className={dark ? "mb-1 block text-xs font-medium uppercase tracking-wide text-mist" : label} htmlFor={id}>{text}</label>
      <div className="flex gap-2">
        <input id={id} type="search" enterKeyHint="search" autoComplete="off" value={q} placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setMsg(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void run(); } }}
          className={dark ? "min-h-[48px] w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-base text-white placeholder:text-mist/80" : input} />
        <button type="button" onClick={() => void run()} disabled={busy} aria-busy={busy}
          className={dark ? "min-h-[48px] shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 font-semibold text-white hover:bg-white/20 disabled:opacity-50" : `${btnGhost} shrink-0`}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${msg.kind === "error" ? (dark ? "bg-red-500/15 text-red-100" : "bg-red-50 text-red-800") : (dark ? "bg-white/10 text-mist" : "bg-navy-50 text-navy-800")}`}>{msg.text}</p>}
      {results && results.length > 0 && (
        <ul className="space-y-1" aria-label="Search results">
          {results.map((t, i) => (
            <li key={resultKey(t, i)}>
              <button type="button" onClick={() => choose(t)} className={`min-h-[48px] w-full rounded-xl border px-3 py-2 text-left text-sm ${dark ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : "border-navy-100 bg-white text-navy-950 hover:bg-navy-50"}`}>{renderResult(t)}</button>
            </li>))}
        </ul>)}
    </div>
  );
}
