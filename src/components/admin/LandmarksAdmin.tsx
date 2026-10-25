"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { btnAccent, btnGhost, btnPrimary, card, input, label } from "@/components/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import { STATUS_TEXT } from "@/lib/geo-pick";
import type { Loc } from "@/lib/types";
import LocationPicker, { type Picked } from "@/components/admin/LocationPicker";

const CHIP: Record<Loc["status"], string> = {
  verified: "bg-emerald-50 text-emerald-800", selected: "bg-navy-50 text-navy-800", placeholder: "bg-amber-50 text-accent-dark",
};
type Mode = "idle" | "details" | "move" | "verify";

function Row({ l, reload, onError }: { l: Loc; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pick, setPick] = useState<Picked | null>(null);
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(l.name); const [desc, setDesc] = useState(l.description);
  const [pickupOk, setPickupOk] = useState(l.pickupAllowed); const [destOk, setDestOk] = useState(l.destinationAllowed);
  const [confirmOff, setConfirmOff] = useState(false);
  const id = `row-${l.id}`;

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); onError(null);
    try { await fn(); after?.(); await reload(); } catch (x) { onError(x instanceof Error ? x.message : "Failed."); } finally { setBusy(false); }
  }
  const close = () => { setMode("idle"); setPick(null); setOk(false); setName(l.name); setDesc(l.description); setPickupOk(l.pickupAllowed); setDestOk(l.destinationAllowed); };
  const saveDetails = () => run(() => api(`/api/v1/admin/locations/${l.id}`, { method: "PATCH", body: { name, description: desc, pickupAllowed: pickupOk, destinationAllowed: destOk } }), close);
  const savePosition = () => run(() => api(`/api/v1/admin/locations/${l.id}/position`, { method: "POST", body: { ...pick, confirmReplaceVerified: l.status === "verified" && ok } }), close);
  const verify = () => run(() => api(`/api/v1/admin/locations/${l.id}/verify`, { method: "POST", body: { confirm: true } }), close);
  const setActive = (active: boolean) => run(() => api(`/api/v1/admin/locations/${l.id}`, { method: "PATCH", body: { active } }), () => setConfirmOff(false));

  return (
    <li className={`${card} !p-4 ${l.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{l.name}{!l.active && <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-800">Deactivated</span>}</p>
          {l.description && <p className="break-words text-sm text-navy-800">{l.description}</p>}
          <p className="mt-0.5 text-xs text-navy-700">{[l.pickupAllowed && "pickup", l.destinationAllowed && "destination"].filter(Boolean).join(" + ") || "not selectable"}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[l.status]}`}>{STATUS_TEXT[l.status]}</span>
      </div>
      {l.status !== "placeholder" && <p className="mt-1 text-xs text-navy-700">Saved position {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)} (used for fares and the map)</p>}

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => setMode("details")}>Edit details</button>
          <button type="button" className={btnGhost} onClick={() => setMode("move")}>{l.status === "placeholder" ? "Set location" : "Change location"}</button>
          {l.status === "selected" && <button type="button" className={btnGhost} onClick={() => setMode("verify")}>Mark ground verified…</button>}
          {l.active ? <button type="button" className={btnGhost} onClick={() => setConfirmOff(true)}>Deactivate</button>
            : <button type="button" className={btnGhost} disabled={busy} onClick={() => setActive(true)}>Reactivate</button>}
        </div>)}

      {mode === "details" && (
        <div className="mt-3 space-y-3">
          <div><label className={label} htmlFor={`${id}-n`}>Name</label><input id={`${id}-n`} className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className={label} htmlFor={`${id}-d`}>Description</label><input id={`${id}-d`} className={input} value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} /></div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={pickupOk} onChange={(e) => setPickupOk(e.target.checked)} /> Students can be picked up here</label>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={destOk} onChange={(e) => setDestOk(e.target.checked)} /> Students can go to here</label>
          <p className="text-xs text-navy-700">Editing details never moves the saved position or removes “ground verified”.</p>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy || name.trim().length < 2} onClick={saveDetails}>{busy ? "Saving…" : "Save details"}</button>
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
          </div>
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
            <button type="button" className={btnPrimary} disabled={busy || !pick || (l.status === "verified" && !ok)} onClick={savePosition}>{busy ? "Saving…" : "Save location"}</button>
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
          </div>
        </div>)}

      {mode === "verify" && (
        <div className="mt-3 space-y-3">
          <label className="flex min-h-[48px] items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>I stood at this pickup point and confirmed the saved position is correct.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !ok} onClick={verify}>{busy ? "Saving…" : "Mark ground verified"}</button>
            <button type="button" className={btnGhost} onClick={close}>Cancel</button>
          </div>
        </div>)}

      <ConfirmDialog open={confirmOff} title={`Deactivate ${l.name}?`} confirmLabel="Deactivate" cancelLabel="Keep active" danger busy={busy} onConfirm={() => setActive(false)} onClose={() => setConfirmOff(false)}>
        Students won't be able to pick it any more. Rides already booked to it are not affected, and you can reactivate it later.
      </ConfirmDialog>
    </li>
  );
}

export default function LandmarksAdmin({ locs, reload, onError }: { locs: Loc[]; reload: () => Promise<void>; onError: (m: string | null) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [pickupOk, setPickupOk] = useState(true); const [destOk, setDestOk] = useState(true);
  const [pick, setPick] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false); const [formErr, setFormErr] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);

  // Creating a landmark needs a NAME only. A map position is optional here and can be set afterwards.
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setDone(null);
    if (name.trim().length < 2) return setFormErr("Enter the landmark name (at least 2 characters).");
    setBusy(true); setFormErr(null); onError(null);
    try {
      await api("/api/v1/admin/locations", { method: "POST", body: { name, description, pickupAllowed: pickupOk, destinationAllowed: destOk, ...(pick ?? {}) } });
      setDone(pick ? `“${name.trim()}” was added with a selected position.` : `“${name.trim()}” was added. It has no map position yet: use “Set location” below when you're ready.`);
      setName(""); setDescription(""); setPick(null); await reload();
    } catch (x) { setFormErr(x instanceof Error ? x.message : "Failed."); }
    finally { setBusy(false); }
  }
  const active = locs.filter((l) => l.active), inactive = locs.filter((l) => !l.active);
  return (
    <div className="space-y-4">
      <form onSubmit={add} noValidate className={`${card} space-y-3`}>
        <h2 className="text-xl font-bold">Add landmark</h2>
        <div><label className={label} htmlFor="ln">Landmark name <span className="text-red-700" aria-hidden="true">*</span></label>
          <input id="ln" required className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={label} htmlFor="ld">Description <span className="font-normal text-navy-700">(optional)</span></label>
          <input id="ld" className={input} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={pickupOk} onChange={(e) => setPickupOk(e.target.checked)} /> Students can be picked up here</label>
        <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={destOk} onChange={(e) => setDestOk(e.target.checked)} /> Students can go to here</label>
        <details className="rounded-xl border border-navy-100 p-3">
          <summary className="min-h-[44px] cursor-pointer py-2 font-medium">Set the map position now <span className="font-normal text-navy-700">(optional)</span></summary>
          <div className="mt-3"><LocationPicker value={pick} onChange={setPick} idPrefix="add" /></div>
        </details>
        {formErr && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formErr}</p>}
        {done && <p role="status" className="rounded-xl bg-navy-50 p-3 text-sm text-navy-900">{done}</p>}
        <button className={`${btnAccent} w-full`} disabled={busy}>{busy ? "Adding…" : "Add landmark"}</button>
        <p className="text-xs text-navy-700">A landmark becomes “Ground verified” only when you confirm it on the spot, from the list below. Adding one never needs your own location or a ride pickup.</p>
      </form>

      {locs.length === 0 ? <p>No landmarks yet.</p> : <ul className="space-y-2">{active.map((l) => <Row key={`${l.id}-${l.name}-${l.description}-${l.pickupAllowed}-${l.destinationAllowed}`} l={l} reload={reload} onError={onError} />)}</ul>}
      {inactive.length > 0 && (<><h3 className="pt-2 text-lg font-bold">Deactivated</h3><ul className="space-y-2">{inactive.map((l) => <Row key={`${l.id}-off`} l={l} reload={reload} onError={onError} />)}</ul></>)}
    </div>
  );
}
