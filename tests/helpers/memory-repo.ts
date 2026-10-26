// TEST HELPER ONLY: in-memory Repo used by automated tests. Never imported by application code.
// Not a demo and not a data source. Ids/names here are obvious test fixtures, and the boundary below is a TEST-ONLY square, not Babcock.
import type { Boundary } from "@/lib/fare";
import type { RideStatus } from "@/lib/ride-state";
import type { Loc, LocSource, Ride, RiderApproval, RiderInfo } from "@/lib/types";
import type { LocationDetailsPatch, NewLoc, NewRide, Repo } from "@/lib/repo";
import { ApiError } from "@/lib/errors";

interface Store { locs: Loc[]; rides: Ride[]; riders: Map<string, RiderInfo>; seq: number; boundary: Boundary }
const g = globalThis as unknown as { __babride?: Store };

export const TEST_USERS = {
  student: { id: "test-student", name: "Test Student" },
  rider: { id: "test-rider", name: "Test Rider" },
  admin: { id: "test-admin", name: "Test Admin" },
} as const;

const ACTIVE: RideStatus[] = ["searching", "assigned", "rider_arriving", "rider_arrived", "in_progress"];
const RIDER_BUSY: RideStatus[] = ["assigned", "rider_arriving", "rider_arrived", "in_progress"];

function seed(): Store {
  const names = ["CAF", "BUSA", "Big Meal", "Guest House", "Amphitheatre", "Emerald Hall", "Winslow Hall"];
  const locs: Loc[] = names.map((name, i) => ({
    id: `loc-${i + 1}`, name, description: "Name supplied by the project owner. Map position NOT verified (placeholder coordinates).",
    latitude: 0, longitude: 0.0001 * (i + 1), verified: false, status: "placeholder", source: null,
    pickupAllowed: true, destinationAllowed: true, active: true,
  }));
  const riders = new Map<string, RiderInfo>();
  riders.set("test-rider", { userId: "test-rider", name: "Test Rider", approval: "approved", online: false, lastSeenAt: null,
    vehicle: { registration: "TEST-TRICYCLE-1", approval: "approved", capacity: 3, capacityVerified: true, capacityDeclared: false } });
  riders.set("test-rider-pending", { userId: "test-rider-pending", name: "Test Applicant", approval: "pending", online: false, lastSeenAt: null,
    vehicle: { registration: "TEST-TRICYCLE-2", approval: "pending", capacity: 3, capacityVerified: false, capacityDeclared: false } });
  // TEST-ONLY square around (0,0). Not real campus coordinates.
  return { locs, rides: [], riders, seq: 1, boundary: [[-1, -1], [-1, 1], [1, 1], [1, -1]] };
}
const S = (): Store => (g.__babride ??= seed());
export const setTestBoundary = (b: Boundary) => { S().boundary = b; };
export const resetMemoryStore = () => { g.__babride = seed(); };
const clone = <T,>(v: T): T => structuredClone(v);
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
      fareKobo: n.fareKobo, currency: "NGN", passengerCount: n.passengerCount, farePerPassengerKobo: Math.round(n.fareKobo / n.passengerCount), paymentMethod: n.paymentMethod, paymentStatus: "outstanding",
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
  async getRider(id: string) { const r = S().riders.get(id); return r ? clone(r) : null; }
  async applyRider(actorId: string, reg: string | undefined, seats: number) {
    const existing = S().riders.get(actorId);
    if (existing) return clone(existing);
    const info: RiderInfo = { userId: actorId, name: nameOf(actorId), approval: "pending", online: false, lastSeenAt: null,
      vehicle: { registration: reg ?? null, approval: "pending", capacity: seats, capacityVerified: false, capacityDeclared: true } };
    S().riders.set(actorId, info); return clone(info);
  }
  async setOnline(id: string, online: boolean) { const r = S().riders.get(id); if (r) { r.online = online; r.lastSeenAt = new Date().toISOString(); } }
  async touchRider(id: string) { const r = S().riders.get(id); if (r) r.lastSeenAt = new Date().toISOString(); }
  async maxVerifiedCapacity() {
    const caps = [...S().riders.values()].filter((r) => r.vehicle?.approval === "approved" && r.vehicle.capacityVerified).map((r) => r.vehicle!.capacity);
    return caps.length ? Math.max(...caps) : null;
  }
  /** Test helper: a rider whose vehicle record is missing (incomplete profile). */
  removeVehicle(id: string) { const r = S().riders.get(id); if (r) r.vehicle = null; }
  /** Test helper: pretend the last heartbeat was this many seconds ago. */
  ageHeartbeat(id: string, seconds: number) { const r = S().riders.get(id); if (r) r.lastSeenAt = new Date(Date.now() - seconds * 1000).toISOString(); }
  async listRiders() { return clone([...S().riders.values()]); }
  async setVehicleCapacity(riderId: string, capacity: number, _adminId?: string) {
    const r = S().riders.get(riderId); if (!r?.vehicle) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    r.vehicle.capacity = capacity; r.vehicle.capacityVerified = true; return clone(r);
  }
  async setRiderApproval(id: string, status: RiderApproval, _adminId?: string) {
    const r = S().riders.get(id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    r.approval = status; if (status !== "approved") r.online = false;
    if (r.vehicle) { r.vehicle.approval = status === "approved" ? "approved" : status === "pending" ? "pending" : "rejected"; if (status === "approved" && r.vehicle.capacityDeclared) r.vehicle.capacityVerified = true; }
    return clone(r);
  }
}
let inst: MemoryRepo | undefined;
export const getMemoryRepo = (): MemoryRepo => (inst ??= new MemoryRepo());