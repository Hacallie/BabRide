// TEST HELPER ONLY: in-memory Repo used by automated tests. Never imported by application code.
// Not a demo and not a data source. Ids/names here are obvious test fixtures, and the boundary below is a TEST-ONLY square, not Babcock.
import type { Boundary } from "@/lib/fare";
import type { RideStatus } from "@/lib/ride-state";
import type { Loc, LocSource, Ride, RiderApproval, RiderInfo } from "@/lib/types";
import type { LocationDetailsPatch, NewLoc, NewRide, Repo } from "@/lib/repo";
import { ApiError } from "@/lib/errors";
import { presenceTtlSec } from "@/lib/config";
import { effectiveOnline } from "@/lib/presence";

interface Store { locs: Loc[]; rides: Ride[]; riders: Map<string, RiderInfo>; seen: Map<string, string>; seq: number; boundary: Boundary }
const g = globalThis as unknown as { __babride?: Store };

export const TEST_USERS = {
  student: { id: "test-student", name: "Test Student" },
  rider: { id: "test-rider", name: "Test Rider" },
  admin: { id: "test-admin", name: "Test Admin" },
} as const;

export const TEST_ORIGIN = { latitude: 10, longitude: 20 } as const; // fixture area, NOT a real place
const ACTIVE: RideStatus[] = ["searching", "assigned", "rider_arriving", "rider_arrived", "in_progress"];
const RIDER_BUSY: RideStatus[] = ["assigned", "rider_arriving", "rider_arrived", "in_progress"];

function seed(): Store {
  const names = ["CAF", "BUSA", "Big Meal", "Guest House", "Amphitheatre", "Emerald Hall", "Winslow Hall"];
  // TEST-ONLY fixture positions in an arbitrary spot far from any real campus (about 10.00N, 20.00E), ~110 m apart along a diagonal.
  // They are fixtures, not Babcock coordinates. A test that needs an UNLOCATED landmark makes one with setTestLocationPosition(id, 0, 0, "placeholder").
  const locs: Loc[] = names.map((name, i) => ({
    id: `loc-${i + 1}`, name, description: "Test fixture landmark (not a real position).",
    latitude: TEST_ORIGIN.latitude + 0.001 * i, longitude: TEST_ORIGIN.longitude + 0.001 * i, verified: false, status: "selected", source: "map",
    pickupAllowed: true, destinationAllowed: true, active: true,
  }));
  const riders = new Map<string, RiderInfo>();
  riders.set("test-rider", { userId: "test-rider", name: "Test Rider", approval: "approved", online: false,
    vehicle: { registration: "TEST-TRICYCLE-1", approval: "approved", capacity: 3, capacityVerified: true } });
  riders.set("test-rider-pending", { userId: "test-rider-pending", name: "Test Applicant", approval: "pending", online: false,
    vehicle: { registration: "TEST-TRICYCLE-2", approval: "pending", capacity: 3, capacityVerified: false } });
  // TEST-ONLY square around the fixture area ([lng, lat] ring). Not real campus coordinates.
  return { locs, rides: [], riders, seen: new Map(), seq: 1, boundary: [[19.9, 9.9], [19.9, 10.1], [20.1, 10.1], [20.1, 9.9]] };
}
const S = (): Store => (g.__babride ??= seed());
export const setTestBoundary = (b: Boundary) => { S().boundary = b; };
export const resetMemoryStore = () => { g.__babride = seed(); };
const clone = <T,>(v: T): T => structuredClone(v);
/** Raw flag + heartbeat -> effective presence, exactly like the Supabase repo. */
const view = (r: RiderInfo): RiderInfo => ({ ...clone(r), online: effectiveOnline(r.online, S().seen.get(r.userId), presenceTtlSec()) });
/** Test control: pretend the rider was last seen `seconds` ago. */
export const ageRider = (id: string, seconds: number) => { S().seen.set(id, new Date(Date.now() - seconds * 1000).toISOString()); };
export const setTestLocationPosition = (id: string, latitude: number, longitude: number, status: Loc["status"] = "selected") => {
  const l = S().locs.find((x) => x.id === id)!; Object.assign(l, { latitude, longitude, status, verified: status === "verified", source: status === "placeholder" ? null : "map" });
};
const nameOf = (id: string) =>
  id === TEST_USERS.student.id ? TEST_USERS.student.name : S().riders.get(id)?.name ?? "Test User";

class MemoryRepo implements Repo {
  kind = "test" as const;
  async getBoundary(): Promise<Boundary> { return S().boundary; }
  async listLocations(all = false) { return clone(S().locs.filter((l) => all || l.active)); }
  async addLocation(l: NewLoc, _adminId: string) {
    const located = l.latitude !== undefined && l.longitude !== undefined && l.source !== undefined;
    const loc: Loc = { id: `loc-${S().locs.length + 1}-${Date.now()}`, name: l.name, description: l.description,
      latitude: located ? l.latitude! : 0, longitude: located ? l.longitude! : 0,
      verified: false, status: located ? "selected" : "placeholder", source: located ? l.source! : null,
      pickupAllowed: l.pickupAllowed, destinationAllowed: l.destinationAllowed, active: true };
    S().locs.push(loc); return clone(loc);
  }
  async updateLocationDetails(id: string, p: LocationDetailsPatch) {
    const l = S().locs.find((x) => x.id === id); if (!l) throw new ApiError(404, "NOT_FOUND", "Landmark not found.");
    Object.assign(l, p); return clone(l); // coordinates and verification are untouched, as in the real repo
  }
  async setLocationPosition(id: string, p: { latitude: number; longitude: number; source: Exclude<LocSource, "legacy"> }) {
    const l = S().locs.find((x) => x.id === id); if (!l) throw new ApiError(404, "NOT_FOUND", "Landmark not found.");
    Object.assign(l, { latitude: p.latitude, longitude: p.longitude, source: p.source, verified: false, status: "selected" });
    return clone(l);
  }
  async verifyLocation(id: string) {
    const l = S().locs.find((x) => x.id === id);
    if (!l || l.verified || l.status === "placeholder") throw new ApiError(409, "CANNOT_VERIFY", "Only a located, not-yet-verified landmark can be marked ground verified.");
    l.verified = true; l.status = "verified"; return clone(l);
  }
  async findRideByKey(studentId: string, key: string) {
    const r = S().rides.find((x) => x.studentId === studentId && (x as Ride & { _k?: string })._k === key);
    return r ? clone(r) : null;
  }
  async activeRideFor(studentId: string) {
    const r = S().rides.find((x) => x.studentId === studentId && ACTIVE.includes(x.status));
    return r ? clone(r) : null;
  }
  async createRide(n: NewRide) {
    const dest = S().locs.find((l) => l.id === n.destinationLocationId)!;
    const pick = n.pickup.locationId ? S().locs.find((l) => l.id === n.pickup.locationId) : undefined;
    const ride: Ride & { _k: string } = {
      id: `test-ride-${S().seq++}`, studentId: n.studentId, studentName: nameOf(n.studentId),
      riderId: null, riderName: null, vehicleReg: null,
      pickup: { ...n.pickup, label: pick ? pick.name : "GPS pin" },
      destination: { id: dest.id, name: dest.name },
      fareKobo: n.fareKobo, farePerPassengerKobo: n.farePerPassengerKobo, currency: "NGN", passengerCount: n.passengerCount, paymentMethod: n.paymentMethod, paymentStatus: "outstanding",
      status: "searching", requestedAt: new Date().toISOString(), cancellationReason: null, _k: n.idempotencyKey,
    };
    S().rides.unshift(ride); return clone(ride);
  }
  async getRide(id: string) { const r = S().rides.find((x) => x.id === id); return r ? clone(r) : null; }
  async listStudentRides(id: string, limit: number) { return clone(S().rides.filter((r) => r.studentId === id).slice(0, limit)); }
  async listRiderRides(id: string, limit: number) { return clone(S().rides.filter((r) => r.riderId === id).slice(0, limit)); }
  async listSearching() { return clone(S().rides.filter((r) => r.status === "searching")); }
  async listAllRides(limit: number) { return clone(S().rides.slice(0, limit)); }
  async transition(id: string, from: RideStatus, to: RideStatus, _actor: string, opts?: { reason?: string; clearRider?: boolean }) {
    const r = S().rides.find((x) => x.id === id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Ride not found.");
    if (r.status !== from) throw new ApiError(409, "STATE_CONFLICT", "Ride status has changed. Refresh and try again.");
    r.status = to;
    if (to === "cancelled") r.cancellationReason = opts?.reason ?? null;
    if (opts?.clearRider) { r.riderId = null; r.riderName = null; r.vehicleReg = null; }
    return clone(r);
  }
  async acceptRide(rideId: string, riderId: string) {
    // Single-threaded JS: this block runs without interleaving, so it is atomic.
    const r = S().rides.find((x) => x.id === rideId);
    if (!r || r.status !== "searching") throw new ApiError(409, "RIDE_UNAVAILABLE", "This ride is no longer available.");
    if (S().rides.some((x) => x.riderId === riderId && RIDER_BUSY.includes(x.status)))
      throw new ApiError(409, "RIDER_BUSY", "Finish your current ride first.");
    const info = S().riders.get(riderId)!;
    if (r.passengerCount > 1) { // mirrors accept_ride_for in migration 0006
      if (!info.vehicle?.capacityVerified) throw new ApiError(409, "CAPACITY_UNVERIFIED", "Capacity not confirmed.");
      if (info.vehicle.capacity < r.passengerCount) throw new ApiError(409, "OVER_CAPACITY", "Over capacity.");
    }
    r.status = "assigned"; r.riderId = riderId; r.riderName = info.name; r.vehicleReg = info.vehicle?.registration ?? null;
    return clone(r);
  }
  async markCashCollected(rideId: string) {
    const r = S().rides.find((x) => x.id === rideId)!; r.paymentStatus = "collected"; return clone(r);
  }
  async getRider(id: string) { const r = S().riders.get(id); return r ? view(r) : null; }
  async applyRider(actorId: string, v: { registration?: string; seatCapacity: number }) {
    const existing = S().riders.get(actorId);
    if (existing) return view(existing);
    const info: RiderInfo = { userId: actorId, name: nameOf(actorId), approval: "pending", online: false,
      vehicle: { registration: v.registration ?? null, approval: "pending", capacity: v.seatCapacity, capacityVerified: true } };
    S().riders.set(actorId, info); return view(info);
  }
  async setOnline(id: string, online: boolean) { const r = S().riders.get(id); if (r) { r.online = online; S().seen.set(id, new Date().toISOString()); } }
  async touchRider(id: string) { if (S().riders.has(id)) S().seen.set(id, new Date().toISOString()); }
  async maxDeclaredCapacity() { return Math.max(0, ...[...S().riders.values()].filter((r) => r.vehicle?.approval === "approved" && r.vehicle.capacityVerified).map((r) => r.vehicle!.capacity)); }
  async listRiders() { return [...S().riders.values()].map(view); }
  async setVehicleCapacity(riderId: string, capacity: number) {
    const r = S().riders.get(riderId); if (!r?.vehicle) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    r.vehicle.capacity = capacity; r.vehicle.capacityVerified = true; return view(r);
  }
  async setRiderApproval(id: string, status: RiderApproval) {
    const r = S().riders.get(id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    r.approval = status; if (status !== "approved") r.online = false;
    if (r.vehicle) r.vehicle.approval = status === "approved" ? "approved" : status === "pending" ? "pending" : "rejected";
    return view(r);
  }
}
let inst: MemoryRepo | undefined;
export const getMemoryRepo = (): Repo => (inst ??= new MemoryRepo());