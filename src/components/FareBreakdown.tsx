import { formatNaira } from "@/lib/fare";

/** "₦200 × 3 passengers = ₦600". `pending` means the server hasn't confirmed it yet (shown as an estimate). */
export default function FareBreakdown({ perPassengerKobo, passengers, totalKobo, pending = false }: { perPassengerKobo: number; passengers: number; totalKobo: number; pending?: boolean }) {
  return (
    <div>
      <p className="tabular-nums text-3xl font-extrabold text-navy-900">{formatNaira(totalKobo)}{pending && <span className="ml-2 align-middle text-xs font-medium text-navy-700">estimate</span>}</p>
      <p className="text-sm text-navy-800">{formatNaira(perPassengerKobo)} per passenger × {passengers} {passengers === 1 ? "passenger" : "passengers"}</p>
    </div>
  );
}
