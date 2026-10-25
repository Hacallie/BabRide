"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog>: the browser provides focus trapping, Escape-to-close and the backdrop (no extra JS weight). */
export default function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Keep it", danger, busy, onConfirm, onClose }: {
  open: boolean; title: string; children?: ReactNode; confirmLabel: string; cancelLabel?: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="w-[min(92vw,26rem)] rounded-xl2 border border-navy-100 bg-white p-0 text-navy-950 shadow-xl backdrop:bg-navy-950/60">
      <div className="p-5 sm:p-6">
        <h2 className="text-xl font-bold">{title}</h2>
        {children && <div className="mt-2 text-sm text-navy-800">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-navy-100 bg-white px-5 font-semibold text-navy-900 hover:bg-navy-50">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-700 hover:bg-red-800" : "bg-royal hover:bg-[#1d4fc7]"}`}>{busy ? "Please wait…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
