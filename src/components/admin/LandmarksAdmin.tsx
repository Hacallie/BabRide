"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { btnAccent, btnGhost, btnPrimary, card, input, label } from "@/components/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { Loc } from "@/lib/types";

function Row({ landmark, reload, onError }: { landmark: Loc; reload: () => Promise<void>; onError: (message: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(landmark.name);
  const [description, setDescription] = useState(landmark.description);
  const [pickupAllowed, setPickupAllowed] = useState(landmark.pickupAllowed);
  const [destinationAllowed, setDestinationAllowed] = useState(landmark.destinationAllowed);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = `row-${landmark.id}`;
  const close = () => { setEditing(false); setName(landmark.name); setDescription(landmark.description); setPickupAllowed(landmark.pickupAllowed); setDestinationAllowed(landmark.destinationAllowed); };
  async function run(request: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true); onError(null);
    try { await request(); after?.(); await reload(); } catch (error) { onError(error instanceof Error ? error.message : "Failed."); } finally { setBusy(false); }
  }
  const save = () => run(() => api(`/api/v1/admin/locations/${landmark.id}`, { method: "PATCH", body: { name, description, pickupAllowed, destinationAllowed } }), close);
  const setActive = (active: boolean) => run(() => api(`/api/v1/admin/locations/${landmark.id}`, { method: "PATCH", body: { active } }), () => setConfirmOff(false));
  return <li className={`${card} !p-4 ${landmark.active ? "" : "opacity-70"}`}>
    <div className="min-w-0"><p className="break-words font-semibold">{landmark.name}{!landmark.active && <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-800">Deactivated</span>}</p>{landmark.description && <p className="break-words text-sm text-navy-800">{landmark.description}</p>}<p className="mt-0.5 text-xs text-navy-700">{[landmark.pickupAllowed && "pickup", landmark.destinationAllowed && "destination"].filter(Boolean).join(" + ") || "not selectable"}</p></div>
    {!editing ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={btnGhost} onClick={() => setEditing(true)}>Edit details</button>{landmark.active ? <button type="button" className={btnGhost} onClick={() => setConfirmOff(true)}>Deactivate</button> : <button type="button" className={btnGhost} disabled={busy} onClick={() => setActive(true)}>Reactivate</button>}</div> : <div className="mt-3 space-y-3"><div><label className={label} htmlFor={`${id}-name`}>Name</label><input id={`${id}-name`} className={input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></div><div><label className={label} htmlFor={`${id}-description`}>Description</label><input id={`${id}-description`} className={input} value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} /></div><label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={pickupAllowed} onChange={(event) => setPickupAllowed(event.target.checked)} /> Students can be picked up here</label><label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={destinationAllowed} onChange={(event) => setDestinationAllowed(event.target.checked)} /> Students can go here</label><div className="flex gap-2"><button type="button" className={btnPrimary} disabled={busy || name.trim().length < 2} onClick={save}>{busy ? "Saving…" : "Save details"}</button><button type="button" className={btnGhost} onClick={close}>Cancel</button></div></div>}
    <ConfirmDialog open={confirmOff} title={`Deactivate ${landmark.name}?`} confirmLabel="Deactivate" cancelLabel="Keep active" danger busy={busy} onConfirm={() => setActive(false)} onClose={() => setConfirmOff(false)}>Students will no longer be able to select this landmark. Existing rides are not affected.</ConfirmDialog>
  </li>;
}

export default function LandmarksAdmin({ locs, reload, onError }: { locs: Loc[]; reload: () => Promise<void>; onError: (message: string | null) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [pickupAllowed, setPickupAllowed] = useState(true); const [destinationAllowed, setDestinationAllowed] = useState(true); const [busy, setBusy] = useState(false); const [formError, setFormError] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  async function add(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (name.trim().length < 2) return setFormError("Enter the landmark name (at least 2 characters).");
    setBusy(true); setFormError(null); setDone(null); onError(null);
    try { await api("/api/v1/admin/locations", { method: "POST", body: { name, description, pickupAllowed, destinationAllowed } }); setDone(`“${name.trim()}” was added.`); setName(""); setDescription(""); await reload(); } catch (error) { setFormError(error instanceof Error ? error.message : "Failed."); } finally { setBusy(false); }
  }
  const active = locs.filter((landmark) => landmark.active), inactive = locs.filter((landmark) => !landmark.active);
  return <div className="space-y-4"><form onSubmit={add} noValidate className={`${card} space-y-3`}><h2 className="text-xl font-bold">Add landmark</h2><div><label className={label} htmlFor="landmark-name">Landmark name <span className="text-red-700" aria-hidden="true">*</span></label><input id="landmark-name" required className={input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></div><div><label className={label} htmlFor="landmark-description">Description <span className="font-normal text-navy-700">(optional)</span></label><input id="landmark-description" className={input} value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} /></div><label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={pickupAllowed} onChange={(event) => setPickupAllowed(event.target.checked)} /> Students can be picked up here</label><label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={destinationAllowed} onChange={(event) => setDestinationAllowed(event.target.checked)} /> Students can go here</label>{formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}</p>}{done && <p role="status" className="rounded-xl bg-navy-50 p-3 text-sm text-navy-900">{done}</p>}<button className={`${btnAccent} w-full`} disabled={busy}>{busy ? "Adding…" : "Add landmark"}</button></form>{locs.length === 0 ? <p>No landmarks yet.</p> : <ul className="space-y-2">{active.map((landmark) => <Row key={`${landmark.id}-${landmark.name}-${landmark.description}-${landmark.pickupAllowed}-${landmark.destinationAllowed}`} landmark={landmark} reload={reload} onError={onError} />)}</ul>}{inactive.length > 0 && <><h3 className="pt-2 text-lg font-bold">Deactivated</h3><ul className="space-y-2">{inactive.map((landmark) => <Row key={`${landmark.id}-off`} landmark={landmark} reload={reload} onError={onError} />)}</ul></>}</div>;
}
