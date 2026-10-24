"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { btnGhost, btnPrimary, card, input, label } from "@/components/ui";
import { STATUS_TEXT } from "@/lib/geo-pick";
import type { Loc } from "@/lib/types";
import LocationPicker, { type Picked } from "@/components/admin/LocationPicker";

const CHIP: Record<Loc["status"], string> = {
  verified: "bg-emerald-50 text-emerald-800", selected: "bg-navy-50 text-navy-800", placeholder: "bg-amber-50 text-accent-dark",
};

function Row({ l, reload, onError }: { l: Loc; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [mode, setMode] = useState<"idle" | "move" | "verify">("idle");
  const [pick, setPick] = useState<Picked | null>(null);
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);

  async function call(action: "position" | "verify") {
    if (busy) return;
    setBusy(true); onError(null);
    try {
      const body = action === "verify" ? { confirm: true } : { ...pick, confirmReplaceVerified: l.status === "verified" && ok };
      await api(`/api/v1/admin/locations/${l.id}/${action}`, { method: "POST", body });
      setMode("idle"); setPick(null); setOk(false); await reload();
    } catch (x) { onError(x instanceof Error ? x.message : "Failed."); }
    finally { setBusy(false); }
  }
  const id = `row-${l.id}`;
  return (
    <li className={`${card} !p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{l.name}</p>
          {l.description && <p className="text-sm text-navy-800">{l.description}</p>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[l.status]}`}>{STATUS_TEXT[l.status]}</span>
      </div>
      {l.status !== "placeholder" && <p className="mt-1 text-xs text-navy-700">Saved position {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)} (used for fares and distance; riders and students never need to see it)</p>}

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => setMode("move")}>{l.status === "placeholder" ? "Set location" : "Change location"}</button>
          {l.status === "selected" && <button type="button" className={btnGhost} onClick={() => setMode("verify")}>Mark ground verified…</button>}
        </div>)}

      {mode === "move" && (
        <div className="mt-3 space-y-3">
          {l.status === "verified" && (
            <label className="flex min-h-[48px] items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>This landmark is <b>ground verified</b>. Moving it removes that verification and it will need checking again.</span>
            </label>)}
          <LocationPicker value={pick} onChange={setPick} idPrefix={id} />
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !pick || (l.status === "verified" && !ok)} onClick={() => call("position")}>{busy ? "Saving…" : "Save location"}</button>
            <button type="button" className={btnGhost} onClick={() => { setMode("idle"); setPick(null); setOk(false); }}>Cancel</button>
          </div>
        </div>)}

      {mode === "verify" && (
        <div className="mt-3 space-y-3">
          <label className="flex min-h-[48px] items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>I stood at this pickup point and confirmed the saved position is correct.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !ok} onClick={() => call("verify")}>{busy ? "Saving…" : "Mark ground verified"}</button>
            <button type="button" className={btnGhost} onClick={() => { setMode("idle"); setOk(false); }}>Cancel</button>
          </div>
        </div>)}
    </li>
  );
}

export default function LandmarksAdmin({ locs, reload, onError }: { locs: Loc[]; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [pick, setPick] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false); const [formErr, setFormErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) return setFormErr("Enter the landmark name.");
    if (!pick) return setFormErr("Choose the pickup point: search for the place or use your current location.");
    setBusy(true); setFormErr(null); onError(null);
    try {
      await api("/api/v1/admin/locations", { method: "POST", body: { name, description, ...pick } });
      setName(""); setDescription(""); setPick(null); await reload();
    } catch (x) { setFormErr(x instanceof Error ? x.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} noValidate className={`${card} space-y-3`}>
        <h2 className="text-xl font-bold">Add landmark</h2>
        <div><label className={label} htmlFor="ln">Landmark name <span className="text-red-700" aria-hidden="true">*</span></label>
          <input id="ln" required className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={label} htmlFor="ld">Description <span className="font-normal text-navy-700">(optional; helps tell similar places apart)</span></label>
          <input id="ld" className={input} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></div>
        <LocationPicker value={pick} onChange={setPick} idPrefix="add" />
        {formErr && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formErr}</p>}
        <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "Adding…" : "Add landmark"}</button>
        <p className="text-xs text-navy-700">New landmarks are saved as “Location selected”. They become “Ground verified” only when you confirm it on the spot, from the list below.</p>
      </form>
      {locs.length === 0 ? <p>No landmarks yet.</p> : <ul className="space-y-2">{locs.map((l) => <Row key={l.id} l={l} reload={reload} onError={onError} />)}</ul>}
    </div>
  );
}