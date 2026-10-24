"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Landmark } from "./types";

interface Props {
  label: string; tone: "origin" | "destination";
  options: Landmark[]; value: string; onChange: (id: string) => void;
  placeholder: string; loading?: boolean;
  /** Shown instead of the selected landmark (e.g. a GPS pin). */
  overrideText?: string | null; onClearOverride?: () => void;
}

export default function LandmarkPicker({ label, tone, options, value, onChange, placeholder, loading, overrideText, onClearOverride }: Props) {
  const id = useId(); const listId = `${id}-list`;
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const shown = useMemo(() => options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase())), [options, q]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away); return () => document.removeEventListener("mousedown", away);
  }, []);
  useEffect(() => setActive(0), [q, open]);

  function pick(o: Landmark) { onChange(o.id); setQ(""); setOpen(false); }
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape") setOpen(false);
  }
  const display = open ? q : overrideText ?? selected?.name ?? "";
  return (
    <div ref={ref} className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-mist">{label}</label>
      <div className="relative">
        <span aria-hidden="true" className={`absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${tone === "origin" ? "border-2 border-white bg-transparent" : "bg-accent ring-4 ring-accent/20"}`} />
        <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && shown[active] ? `${id}-o${active}` : undefined}
          autoComplete="off" disabled={loading} value={display} placeholder={loading ? "Loading landmarks…" : placeholder}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); if (overrideText) onClearOverride?.(); }} onKeyDown={key}
          className="min-h-[48px] w-full rounded-xl border border-white/15 bg-white/10 py-3 pl-10 pr-3 text-base text-white placeholder:text-mist/80 transition focus:border-white/40 focus:bg-white/15 disabled:opacity-60" />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="rise absolute z-20 mt-1.5 max-h-60 w-full overflow-auto rounded-xl border border-navy-100 bg-white p-1 text-navy-950 shadow-xl">
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-navy-800">No landmark matches “{q}”.</li>}
          {shown.map((o, i) => (
            <li key={o.id} id={`${id}-o${i}`} role="option" aria-selected={o.id === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between py-1 rounded-lg px-3 text-base ${i === active ? "bg-navy-50" : ""} ${o.id === value ? "font-semibold" : ""}`}>
              <span className="min-w-0"><span className="block">{o.name}</span>{o.description && <span className="block truncate text-xs font-normal text-navy-700">{o.description}</span>}</span>
              {!o.verified && <span className="ml-2 shrink-0 text-xs text-accent-dark">position unverified</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}