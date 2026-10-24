export const RIDE_STATUSES = ["searching","assigned","rider_arriving","rider_arrived","in_progress","completed","cancelled","expired"] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

const TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  searching: ["assigned", "cancelled", "expired"],
  assigned: ["rider_arriving", "cancelled", "searching"], // searching = reassignment
  rider_arriving: ["rider_arrived", "cancelled", "searching"],
  rider_arrived: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [], cancelled: [], expired: [],
};

export const canTransition = (from: RideStatus, to: RideStatus) => TRANSITIONS[from].includes(to);
export const isTerminal = (s: RideStatus) => TRANSITIONS[s].length === 0;
export const isActive = (s: RideStatus) => !isTerminal(s);

export function assertTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid ride transition: ${from} -> ${to}`);
}
