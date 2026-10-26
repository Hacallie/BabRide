"use client";
/**
 * Number of people travelling. The fare is ₦200 PER PASSENGER; the server recomputes the total, enforces the limit, and each
 * rider's keke seat capacity is checked when they accept.
 */
export default function PassengerPicker({ value, onChange, max, tone = "light", disabled }: {
  value: number; onChange: (n: number) => void; max: number; tone?: "light" | "dark"; disabled?: boolean;
}) {
  const dark = tone === "dark";
  const btn = `flex h-12 w-12 items-center justify-center rounded-xl border text-2xl font-semibold leading-none transition disabled:opacity-40 ${dark ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-navy-100 bg-white text-navy-900 hover:bg-navy-50"}`;
  return (
    <fieldset className="min-w-0">
      <legend className={dark ? "mb-1.5 text-xs font-medium uppercase tracking-wide text-mist" : "mb-1 text-sm font-medium text-navy-800"}>Passengers</legend>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} aria-label="One fewer passenger" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>−</button>
        <output aria-live="polite" className={`min-w-[2.5rem] text-center text-2xl font-extrabold tabular-nums ${dark ? "text-white" : "text-navy-950"}`}>{value}</output>
        <button type="button" className={btn} aria-label="One more passenger" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
        <p className={`min-w-0 flex-1 text-xs ${dark ? "text-mist" : "text-navy-700"}`}>Up to {max} per booking. ₦200 per passenger, so the total goes up with each person. Only a keke with enough seats can accept a group.</p>
      </div>
    </fieldset>
  );
}
