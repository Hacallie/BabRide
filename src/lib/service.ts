// Business logic. Reuses fare.ts and ride-state.ts; never trusts client-supplied fare/role/status.
import { quoteBetweenLandmarks, quoteFare } from "@/lib/fare";
import type { QuoteResult } from "@/lib/fare";
import { canTransition } from "@/lib/ride-state";
import type { RideStatus } from "@/lib/ride-state";
import { ApiError } from "@/lib/errors";
import { maxPassengers, searchTimeoutMinutes, serviceAreaMode } from "@/lib/config";
import type { Repo } from "@/lib/repo";
import type { AddLocationInput, SetLocationPositionInput, UpdateLocationDetailsInput } from "@/lib/schemas";
import type { Actor, Loc, Ride, Role, RiderApproval, RiderInfo } from "@/lib/types";

export interface PickupInput { latitude?: number; longitude?: number; locationId?: string }
export interface CreateRideInput {
  pickup: PickupInput; destinationLocationId: string; passengerCount?: number;
  paymentMethod: "cash" | "electronic"; idempotencyKey: string;
}

const ACTIVE: RideStatus[] = ["searching", "assigned", "rider_arriving", "rider_arrived", "in_progress"];
const RIDER_BUSY: RideStatus[] = ["assigned", "rider_arriving", "rider_arrived", "in_progress"];

export function requireRole(actor: Actor | null, ...roles: Role[]): Actor {
  if (!actor) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
  if (!roles.includes(actor.role)) throw new ApiError(403, "FORBIDDEN", "You do not have access to this.");
  return actor;
}

async function resolveDestination(repo: Repo, id: string): Promise<Loc> {
  const d = (await repo.listLocations()).find((l) => l.id === id);
  if (!d || !d.destinationAllowed) throw new ApiError(422, "BAD_DESTINATION", "That destination is not available.");
  return d;
}

/** A landmark that was created by name only: it has no real map position (stored as the 0,0 placeholder). */
const isUnlocated = (l: Loc) => l.status === "placeholder" && l.latitude === 0 && l.longitude === 0;
const notLocated = (l: Loc) => new ApiError(422, "LANDMARK_NOT_LOCATED",
  `${l.name} doesn't have a map position yet, so this trip can't be priced. An administrator needs to set its location.`);

export interface QuoteView {
  fareKobo: number; currency: string;
  pickup: { latitude: number | null; longitude: number | null; locationId: string | null; label: string };
  destination: { id: string; name: string };
}

/** The fare is always the fixed 20000 kobo; this only decides whether the trip is ELIGIBLE. Distance never matters. */
export async function quote(repo: Repo, pickup: PickupInput, destinationId: string): Promise<QuoteView> {
  const dest = await resolveDestination(repo, destinationId);
  const boundary = await repo.getBoundary();
  let result: QuoteResult; let view: QuoteView["pickup"];

  if (pickup.locationId) {
    const p = (await repo.listLocations()).find((x) => x.id === pickup.locationId);
    if (!p || !p.pickupAllowed) throw new ApiError(422, "BAD_PICKUP", "That pickup point is not available.");
    view = { latitude: isUnlocated(p) ? null : p.latitude, longitude: isUnlocated(p) ? null : p.longitude, locationId: p.id, label: p.name };
    const geometryPossible = !!boundary && !isUnlocated(p) && !isUnlocated(dest);
    if (serviceAreaMode() === "landmarks" && !geometryPossible) {
      result = quoteBetweenLandmarks(p.id, dest.id); // the curated landmark list is the service area
    } else {
      if (isUnlocated(p)) throw notLocated(p);
      if (isUnlocated(dest)) throw notLocated(dest);
      result = quoteFare({ latitude: p.latitude, longitude: p.longitude }, { latitude: dest.latitude, longitude: dest.longitude }, { boundary });
    }
  } else {
    if (pickup.latitude === undefined || pickup.longitude === undefined)
      throw new ApiError(422, "BAD_PICKUP", "Choose a pickup landmark or use your current location.");
    if (isUnlocated(dest)) throw notLocated(dest);
    view = { latitude: pickup.latitude, longitude: pickup.longitude, locationId: null, label: "My location (GPS)" };
    result = quoteFare({ latitude: pickup.latitude, longitude: pickup.longitude }, { latitude: dest.latitude, longitude: dest.longitude }, { boundary });
    if (!result.ok && result.code === "BOUNDARY_NOT_CONFIGURED")
      throw new ApiError(422, "BOUNDARY_NOT_CONFIGURED", "Using your location isn't available yet. Please choose a pickup landmark instead.");
  }
  if (!result.ok) throw new ApiError(422, result.code, result.message);
  return { fareKobo: result.fareKobo, currency: result.currency, pickup: view, destination: { id: dest.id, name: dest.name } };
}

export async function createRide(repo: Repo, actor: Actor | null, input: CreateRideInput): Promise<Ride> {
  const a = requireRole(actor, "student");
  const existing = await repo.findRideByKey(a.id, input.idempotencyKey);
  if (existing) return existing; // double-tap / retry: same ride, no duplicate
  if (input.paymentMethod === "electronic")
    throw new ApiError(501, "PAYMENTS_NOT_ENABLED", "Electronic payment is not enabled yet. Please choose cash.");
  if (await repo.activeRideFor(a.id)) throw new ApiError(409, "ACTIVE_RIDE", "You already have an active ride.");
  const passengers = input.passengerCount ?? 1;
  const max = maxPassengers();
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > max)
    throw new ApiError(422, "BAD_PASSENGERS", `You can book for 1 to ${max} passengers.`);
  const q = await quote(repo, input.pickup, input.destinationLocationId);
  return repo.createRide({
    studentId: a.id, idempotencyKey: input.idempotencyKey,
    pickup: { latitude: q.pickup.latitude, longitude: q.pickup.longitude, locationId: q.pickup.locationId },
    passengerCount: passengers, // the fare is per ride: q.fareKobo does not depend on the group size
    destinationLocationId: q.destination.id, paymentMethod: input.paymentMethod, fareKobo: q.fareKobo,
  });
}

/** Lazily expire stale searching rides (no background worker needed for the MVP). */
async function expireStale(repo: Repo) {
  const cutoff = Date.now() - searchTimeoutMinutes() * 60_000;
  for (const r of await repo.listSearching()) {
    if (new Date(r.requestedAt).getTime() < cutoff) {
      try { await repo.transition(r.id, "searching", "expired", "system", { reason: "no rider accepted in time" }); }
      catch { /* someone else changed it first: fine */ }
    }
  }
}

export async function listMyRides(repo: Repo, actor: Actor | null): Promise<Ride[]> {
  const a = requireRole(actor, "student", "rider");
  await expireStale(repo);
  return a.role === "student" ? repo.listStudentRides(a.id, 30) : repo.listRiderRides(a.id, 30);
}

export async function getMyRide(repo: Repo, actor: Actor | null, id: string): Promise<Ride> {
  const a = requireRole(actor, "student", "rider", "admin");
  const r = await repo.getRide(id);
  if (!r || (a.role === "student" && r.studentId !== a.id) || (a.role === "rider" && r.riderId !== a.id))
    throw new ApiError(404, "NOT_FOUND", "Ride not found."); // 404, not 403: don't reveal existence
  return r;
}

async function approvedOnlineRider(repo: Repo, id: string): Promise<RiderInfo> {
  const info = await repo.getRider(id);
  if (!info || info.approval !== "approved" || info.vehicle?.approval !== "approved")
    throw new ApiError(403, "RIDER_NOT_APPROVED", "Your rider account is not approved yet.");
  if (!info.online) throw new ApiError(409, "RIDER_OFFLINE", "Go online to accept rides.");
  return info;
}

/** A single passenger fits any approved vehicle. A group needs an administrator-confirmed seat capacity that is big enough. */
export function assertCapacity(info: RiderInfo, passengers: number): void {
  if (passengers <= 1) return;
  const v = info.vehicle;
  if (!v?.capacityVerified)
    throw new ApiError(409, "CAPACITY_UNVERIFIED", `This ride has ${passengers} passengers, and an administrator hasn't confirmed your vehicle's seat capacity yet.`);
  if (v.capacity < passengers)
    throw new ApiError(409, "OVER_CAPACITY", `This ride needs ${passengers} seats but your vehicle seats ${v.capacity}.`);
}

export type RideAction = "cancel" | "accept" | "release" | "depart" | "arrive" | "start" | "complete" | "collect-cash";
const RIDER_STEPS: Partial<Record<RideAction, { from: RideStatus; to: RideStatus }>> = {
  depart: { from: "assigned", to: "rider_arriving" },
  arrive: { from: "rider_arriving", to: "rider_arrived" },
  start: { from: "rider_arrived", to: "in_progress" },
  complete: { from: "in_progress", to: "completed" },
};

export async function rideAction(repo: Repo, actor: Actor | null, rideId: string, action: RideAction): Promise<Ride> {
  if (action === "cancel") {
    const a = requireRole(actor, "student");
    const r = await repo.getRide(rideId);
    if (!r || r.studentId !== a.id) throw new ApiError(404, "NOT_FOUND", "Ride not found.");
    if (!canTransition(r.status, "cancelled")) throw new ApiError(409, "CANNOT_CANCEL", `A ${r.status.replace("_", " ")} ride cannot be cancelled.`);
    return repo.transition(rideId, r.status, "cancelled", a.id, { reason: "cancelled by student" });
  }
  const a = requireRole(actor, "rider");
  if (action === "accept") {
    const info = await approvedOnlineRider(repo, a.id);
    const target = await repo.getRide(rideId);
    if (target) assertCapacity(info, target.passengerCount); // the database function re-checks this atomically
    return repo.acceptRide(rideId, a.id);
  }
  const r = await repo.getRide(rideId);
  if (!r || r.riderId !== a.id) throw new ApiError(404, "NOT_FOUND", "Ride not found.");
  if (action === "release") {
    if (r.status !== "assigned" && r.status !== "rider_arriving") throw new ApiError(409, "CANNOT_RELEASE", "You can only release before arriving.");
    return repo.transition(rideId, r.status, "searching", a.id, { reason: "released by rider", clearRider: true });
  }
  if (action === "collect-cash") {
    if (r.paymentMethod !== "cash" || r.status !== "completed" || r.paymentStatus !== "outstanding")
      throw new ApiError(409, "CANNOT_COLLECT", "Cash can only be recorded once, after a completed cash ride.");
    return repo.markCashCollected(rideId);
  }
  const step = RIDER_STEPS[action];
  if (!step) throw new ApiError(400, "BAD_ACTION", "Unknown action.");
  if (!canTransition(step.from, step.to) || r.status !== step.from)
    throw new ApiError(409, "INVALID_TRANSITION", `Cannot ${action} while the ride is ${r.status.replace("_", " ")}.`);
  return repo.transition(rideId, step.from, step.to, a.id);
}

export async function riderApply(repo: Repo, actor: Actor | null, vehicleRegistration?: string) {
  const a = requireRole(actor, "student", "rider"); // admins cannot apply; the role is never taken from the request
  return repo.applyRider(a.id, vehicleRegistration); // registration is optional; always created as 'pending'
}

export async function riderSetOnline(repo: Repo, actor: Actor | null, online: boolean) {
  const a = requireRole(actor, "rider");
  if (online) {
    const info = await repo.getRider(a.id);
    if (!info || info.approval !== "approved" || info.vehicle?.approval !== "approved")
      throw new ApiError(403, "RIDER_NOT_APPROVED", "Your rider account is not approved yet.");
  }
  await repo.setOnline(a.id, online);
}

/** Riders only see pickup/destination/fare of unassigned rides, never student identity. */
export async function riderRequests(repo: Repo, actor: Actor | null) {
  const a = requireRole(actor, "rider");
  const info = await repo.getRider(a.id);
  const mine = await repo.listRiderRides(a.id, 20);
  const active = mine.find((r) => RIDER_BUSY.includes(r.status) ) ?? null;
  const recent = mine.filter((r) => !RIDER_BUSY.includes(r.status)).slice(0, 10);
  let requests: Ride[] = [];
  if (info?.approval === "approved" && info.online && !active) {
    await expireStale(repo);
    requests = (await repo.listSearching()).map((r) => ({ ...r, studentId: "", studentName: "Student" }));
  }
  return { rider: info, active, requests, recent };
}

export async function adminDashboard(repo: Repo, actor: Actor | null) {
  requireRole(actor, "admin");
  const [rides, riders] = await Promise.all([repo.listAllRides(500), repo.listRiders()]);
  const byStatus: Record<string, number> = {};
  for (const r of rides) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const cash = rides.filter((r) => r.paymentMethod === "cash" && r.status === "completed");
  return {
    totalRides: rides.length, byStatus,
    activeRides: rides.filter((r) => ACTIVE.includes(r.status)).length,
    riders: { approved: riders.filter((r) => r.approval === "approved").length,
      pending: riders.filter((r) => r.approval === "pending").length },
    cash: { collectedKobo: cash.filter((r) => r.paymentStatus === "collected").reduce((s, r) => s + r.fareKobo, 0),
      outstandingKobo: cash.filter((r) => r.paymentStatus === "outstanding").reduce((s, r) => s + r.fareKobo, 0) },
  };
}

export async function adminRiderAction(repo: Repo, actor: Actor | null, riderId: string, action: "approve" | "reject" | "suspend") {
  const a = requireRole(actor, "admin");
  const status: RiderApproval = action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended";
  return repo.setRiderApproval(riderId, status, a.id);
}

// ---- Landmarks (admin only; every rule is enforced here, not in the UI) ----
async function findLocation(repo: Repo, id: string): Promise<Loc> {
  const l = (await repo.listLocations(true)).find((x) => x.id === id);
  if (!l) throw new ApiError(404, "NOT_FOUND", "Landmark not found.");
  return l;
}

/** New landmarks are always "selected", never ground verified, whatever the client sends. */
export async function adminAddLocation(repo: Repo, actor: Actor | null, input: AddLocationInput): Promise<Loc> {
  const a = requireRole(actor, "admin");
  return repo.addLocation({ name: input.name, description: input.description, latitude: input.latitude, longitude: input.longitude,
    source: input.source, pickupAllowed: input.pickupAllowed, destinationAllowed: input.destinationAllowed }, a.id);
}

export async function adminSetLocationPosition(repo: Repo, actor: Actor | null, id: string, input: SetLocationPositionInput): Promise<Loc> {
  const a = requireRole(actor, "admin");
  const cur = await findLocation(repo, id);
  if (cur.status === "verified" && !input.confirmReplaceVerified)
    throw new ApiError(409, "VERIFIED_LOCATION", "This landmark is ground verified. Moving it removes that verification. Confirm to continue.");
  return repo.setLocationPosition(id, { latitude: input.latitude, longitude: input.longitude, source: input.source }, a.id);
}

export async function adminVerifyLocation(repo: Repo, actor: Actor | null, id: string): Promise<Loc> {
  const a = requireRole(actor, "admin");
  const cur = await findLocation(repo, id);
  if (cur.status === "placeholder") throw new ApiError(409, "NOT_LOCATED", "Choose this landmark's position first.");
  if (cur.status === "verified") return cur; // already verified: no change, no new metadata
  return repo.verifyLocation(id, a.id);
}

export async function adminUpdateLocationDetails(repo: Repo, actor: Actor | null, id: string, input: UpdateLocationDetailsInput): Promise<Loc> {
  const a = requireRole(actor, "admin");
  await findLocation(repo, id); // 404 if unknown. Coordinates and verification are never changed here.
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  return repo.updateLocationDetails(id, patch, a.id);
}

export async function adminSetVehicleCapacity(repo: Repo, actor: Actor | null, riderId: string, capacity: number) {
  const a = requireRole(actor, "admin");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new ApiError(422, "BAD_CAPACITY", "Seats must be a whole number from 1 to 8.");
  const info = await repo.getRider(riderId);
  if (!info?.vehicle) throw new ApiError(404, "NOT_FOUND", "That rider has no vehicle on file.");
  return repo.setVehicleCapacity(riderId, capacity, a.id);
}
