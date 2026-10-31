import { FARE_PER_PASSENGER_KOBO, formatNaira, totalFareKobo } from "@/lib/fare";

/** Shows ₦200 per passenger and the total BEFORE the person confirms. The total shown here is a convenience:
 *  the server recomputes it from the passenger count and stores its own figure. */
export default function FareSummary({ passengers, tone = "light" }: { passengers: number; tone?: "light" | "dark" }) {
  const dark = tone === "dark"; const n = Number.isInteger(passengers) && passengers >= 1 ? passengers : 1;
  return (
    <div className={`rounded-xl p-4 ${dark ? "border border-white/12 bg-white/5 text-white" : "bg-navy-50 text-navy-900"}`} aria-live="polite" data-testid="fare-summary">
      <div className={`flex items-center justify-between text-sm ${dark ? "text-mist" : "text-navy-700"}`}>
        <span>Fare per passenger</span><span data-testid="fare-each">{formatNaira(FARE_PER_PASSENGER_KOBO)}</span>
      </div>
      <div className={`flex items-center justify-between text-sm ${dark ? "text-mist" : "text-navy-700"}`}>
        <span>Passengers</span><span>× {n}</span>
      </div>
      <div className="mt-2 flex items-end justify-between border-t border-current/10 pt-2">
        <span className={`text-xs uppercase tracking-wide ${dark ? "text-mist" : "text-navy-700"}`}>Total fare</span>
        <span className="text-3xl font-extrabold leading-none" data-testid="fare-total">{formatNaira(totalFareKobo(n))}</span>
      </div>
    </div>
  );
}
