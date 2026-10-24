import type { RideStatus } from "@/lib/ride-state";
export const STATUS_LABEL: Record<RideStatus, string> = {
  searching: "Finding a rider", assigned: "Rider assigned", rider_arriving: "Rider on the way",
  rider_arrived: "Rider has arrived", in_progress: "Ride in progress",
  completed: "Completed", cancelled: "Cancelled", expired: "No rider found",
};
const TONE: Record<RideStatus, string> = {
  searching: "bg-amber-100 text-amber-900", assigned: "bg-navy-100 text-navy-900", rider_arriving: "bg-navy-100 text-navy-900",
  rider_arrived: "bg-emerald-100 text-emerald-900", in_progress: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-100 text-slate-800", cancelled: "bg-red-100 text-red-800", expired: "bg-slate-100 text-slate-700",
};
export default function StatusBadge({ status }: { status: RideStatus }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
