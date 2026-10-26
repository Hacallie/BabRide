import type { Boundary } from "@/lib/fare";
import type { RideStatus } from "@/lib/ride-state";
import type { Loc, LocSource, Ride, RiderApproval, RiderInfo } from "@/lib/types";
import { appMode } from "@/lib/config";
import { ApiError } from "@/lib/errors";

export interface NewRide {
  studentId: string; idempotencyKey: string;
  pickup: { latitude: number | null; longitude: number | null; locationId: string | null };
  passengerCount: number;
  destinationLocationId: string; paymentMethod: "cash" | "electronic"; fareKobo: number;
}

/** Position is OPTIONAL: a landmark can be created by name alone and located later ("Not located yet"). */
export interface NewLoc {
  name: string; description: string; latitude?: number; longitude?: number;
  source?: Exclude<LocSource, "legacy">; pickupAllowed: boolean; destinationAllowed: boolean;
}
/** Details only. Coordinates and verification are never touched here; use setLocationPosition / verifyLocation. */
export interface LocationDetailsPatch { name?: string; description?: string; pickupAllowed?: boolean; destinationAllowed?: boolean; active?: boolean }

export interface Repo {
  kind: "supabase" | "test"; // "test" is only used by the in-memory helper under tests/
  getBoundary(): Promise<Boundary>;
  listLocations(includeInactive?: boolean): Promise<Loc[]>;
  addLocation(l: NewLoc, adminId: string): Promise<Loc>;
  /** Moves a landmark. Always clears "ground verified" (the old verification no longer applies to the new point). */
  setLocationPosition(id: string, p: { latitude: number; longitude: number; source: Exclude<LocSource, "legacy"> }, adminId: string): Promise<Loc>;
  updateLocationDetails(id: string, patch: LocationDetailsPatch, adminId: string): Promise<Loc>;
  /** Marks a located landmark ground verified. Fails with 409 if it is not located or already verified. */
  verifyLocation(id: string, adminId: string): Promise<Loc>;
  findRideByKey(studentId: string, key: string): Promise<Ride | null>;
  activeRideFor(studentId: string): Promise<Ride | null>;
  createRide(r: NewRide): Promise<Ride>;
  getRide(id: string): Promise<Ride | null>;
  listStudentRides(id: string, limit: number): Promise<Ride[]>;
  listRiderRides(id: string, limit: number): Promise<Ride[]>;
  listSearching(): Promise<Ride[]>;
  listAllRides(limit: number): Promise<Ride[]>;
  /** Compare-and-set: fails with 409 if the ride is no longer in `from`. */
  transition(id: string, from: RideStatus, to: RideStatus, actorId: string,
    opts?: { reason?: string; clearRider?: boolean }): Promise<Ride>;
  /** Atomic: exactly one rider can win. */
  acceptRide(rideId: string, riderId: string): Promise<Ride>;
  markCashCollected(rideId: string): Promise<Ride>;
  getRider(id: string): Promise<RiderInfo | null>;
  /** Seats = passenger seats the rider declares (the driver is not counted). */
  applyRider(actorId: string, vehicleRegistration: string | undefined, seats: number): Promise<RiderInfo>;
  setOnline(id: string, online: boolean): Promise<void>;
  /** Heartbeat: refreshes last_seen_at without changing the online flag. */
  touchRider(id: string): Promise<void>;
  /** Largest administrator-confirmed seat capacity among approved vehicles, or null if none is confirmed yet. */
  maxVerifiedCapacity(): Promise<number | null>;
  listRiders(): Promise<RiderInfo[]>;
  setRiderApproval(id: string, status: RiderApproval, adminId: string): Promise<RiderInfo>;
  /** Records an administrator-confirmed seat capacity for the rider's vehicle. */
  setVehicleCapacity(riderId: string, capacity: number, adminId: string): Promise<RiderInfo>;
}

export async function getRepo(): Promise<Repo> {
  if (appMode() === "supabase") return (await import("@/lib/supabase-repo")).getSupabaseRepo();
  throw new ApiError(503, "NOT_CONFIGURED",
    "Bab Ride is not configured. Required environment variables are missing or invalid.");
}