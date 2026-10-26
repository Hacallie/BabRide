// Business logic. Reuses fare.ts and ride-state.ts; never trusts client-supplied fare/role/status.
import { pointInPolygon, quoteBetweenLandmarks, quoteFare, totalFareKobo } from "@/lib/fare";
import { nearestLandmarks, type NearestResult } from "@/lib/nearest";
import type { QuoteResult } from "@/lib/fare";
import { canTransition } from "@/lib/ride-state";
import type { RideStatus } from "@/lib/ride-state";
import { ApiError } from "@/lib/errors";
import { maxPassengers, maxVehicleSeats, nearestMaxMeters, riderStaleSeconds, searchTimeoutMinutes, serviceAreaMode } from "@/lib/config";
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

export function checkPassengers(n: unknown): number {
  const max = maxPassengers();
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > max)
    throw new ApiError(422, "BAD_PASSENGERS", `You can book for 1 to ${max} passengers.`);
  return n;
}

/** A landmark that was created by name only: it has no real map position (stored as the 0,0 placeholder). */
const isUnlocated = (l: Loc) => l.status === "placeholder" && l.latitude === 0 && l.longitude === 0;
// Students get a plain message. The fix (set the position) is shown to administrators in Admin > Landmarks.
const notLocated = (l: Loc) => new ApiError(422, "LANDMARK_NOT_LOCATED",
  `${l.name} can't be booked right now. Please choose another place, or try again later.`);

export interface QuoteView {
  /** TOTAL for the whole booking = farePerPassengerKobo x passengerCount. */
  fareKobo: number; farePerPassengerKobo: number; passengerCount: number; currency: string;
  pickup: { latitude: number | null; longitude: number | null; locationId: string | null; label: string };
  destination: { id: string; name: string };
}

/** The fare is always the fixed 20000 kobo; this only decides whether the trip is ELIGIBLE. Distance never matters. */
export async function quote(repo: Repo, pickup: PickupInput, destinationId: string, passengerCount = 1): Promise<QuoteView> {
  const passengers = checkPassengers(passengerCount);
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
  // The server alone computes the total: per-passenger fare x passengers. Nothing the browser sends is used as a price.
  return { fareKobo: totalFareKobo(passengers, result.fareKobo), farePerPassengerKobo: result.fareKobo, passengerCount: passengers, currency: result.currency, pickup: view, destination: { id: dest.id, name: dest.name } };
}

export async function createRide(repo: Repo, actor: Actor | null, input: CreateRideInput): Promise<Ride> {
  const a = requireRole(actor, "student");
  const existing = await repo.findRideByKey(a.id, input.idempotencyKey);
  if (existing) return existing; // double-tap / retry: same ride, no duplicate
  if (input.paymentMethod === "electronic")
    throw new ApiError(501, "PAYMENTS_NOT_ENABLED", "Electronic payment is not enabled yet. Please choose cash.");
  if (await repo.activeRideFor(a.id)) throw new ApiError(409, "ACTIVE_RIDE", "You already have an active ride.");
  const passengers = checkPassengers(input.passengerCount ?? 1);
  // Reject early, with the reason, when no registered keke could ever carry this group. The seat check at acceptance still applies.
  const biggest = await repo.maxVerifiedCapacity();
  if (passengers > 1 && biggest !== null && passengers > biggest)
    throw new ApiError(422, "NO_KEKE_FITS", `No keke on campus seats ${passengers} passengers (the largest seats ${biggest}). Please book in smaller groups.`);
  const q = await quote(repo, input.pickup, input.destinationLocationId, passengers);
  return repo.createRide({
    studentId: a.id, idempotencyKey: input.idempotencyKey,
    pickup: { latitude: q.pickup.latitude, longitude: q.pickup.longitude, locationId: q.pickup.locationId },
    passengerCount: passengers, // q.fareKobo is the total: 20000 kobo x passengers, computed above on the server
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

/** Online means the flag is set AND the rider's last heartbeat is recent: a dead phone or expired session drops out by itself. */
export function isFresh(info: Pick<RiderInfo, "lastSeenAt">, now = Date.now()): boolean {
  return !!info.lastSeenAt && now - new Date(info.lastSeenAt).getTime() <= riderStaleSeconds() * 1000;
}
export const isEffectivelyOnline = (info: RiderInfo, now = Date.now()) => info.online && isFresh(info, now);
const canWork = (info: RiderInfo | null): info is RiderInfo => !!info && info.approval === "approved" && info.vehicle?.approval === "approved";

async function approvedOnlineRider(repo: Repo, id: string): Promise<RiderInfo> {
  const info = await repo.getRider(id);
  if (!canWork(info)) throw new ApiError(403, "RIDER_NOT_APPROVED", "Your rider account is not approved yet.");
  if (!isEffectivelyOnline(info)) throw new ApiError(409, "RIDER_OFFLINE", "You're offline. Go online to accept rides.");
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

export async function riderApply(repo: Repo, actor: Actor | null, vehicleRegistration: string | undefined, seats: number) {
  const a = requireRole(actor, "student", "rider"); // admins cannot apply; the role is never taken from the request
  const max = maxVehicleSeats();
  if (!Number.isInteger(seats) || seats < 1 || seats > max)
    throw new ApiError(422, "BAD_SEATS", `Enter how many passengers your keke seats (1 to ${max}). Don't count yourself.`);
  return repo.applyRider(a.id, vehicleRegistration, seats); // registration is optional; always created as 'pending'
}

export async function riderSetOnline(repo: Repo, actor: Actor | null, online: boolean) {
  const a = requireRole(actor, "rider");
  if (online && !canWork(await repo.getRider(a.id)))
    throw new ApiError(403, "RIDER_NOT_APPROVED", "Your rider account is not approved yet.");
  await repo.setOnline(a.id, online);
}

export type SessionStartResult = { online: true } | { online: false; reason: "NOT_APPROVED" | "INCOMPLETE_PROFILE" | "SUSPENDED" };
/**
 * Called right after a rider signs in. An approved rider with an approved vehicle is set online in the database; anyone else is
 * left offline with a reason and NO error, so signing in is never blocked. Customers and admins are refused outright.
 */
export async function riderSessionStart(repo: Repo, actor: Actor | null): Promise<SessionStartResult> {
  const a = requireRole(actor, "rider"); // a customer can never be marked as a driver
  const info = await repo.getRider(a.id);
  if (!info || !info.vehicle) return { online: false, reason: "INCOMPLETE_PROFILE" };
  if (info.approval === "suspended" || info.approval === "rejected") return { online: false, reason: "SUSPENDED" };
  if (!canWork(info)) return { online: false, reason: "NOT_APPROVED" };
  await repo.setOnline(a.id, true); // also refreshes the heartbeat; calling it twice (two tabs, a reconnect) is harmless
  return { online: true };
}
/** Sign-out or session end. Idempotent: already-offline stays offline. */
export async function riderSessionEnd(repo: Repo, actor: Actor | null): Promise<{ online: false }> {
  const a = requireRole(actor, "rider");
  await repo.setOnline(a.id, false);
  return { online: false };
}

/** Riders only see pickup/destination/fare of unassigned rides, never student identity. */
export async function riderRequests(repo: Repo, actor: Actor | null) {
  const a = requireRole(actor, "rider");
  const raw = await repo.getRider(a.id);
  const mine = await repo.listRiderRides(a.id, 20);
  const active = mine.find((r) => RIDER_BUSY.includes(r.status) ) ?? null;
  const recent = mine.filter((r) => !RIDER_BUSY.includes(r.status)).slice(0, 10);
  // This poll is the heartbeat: it keeps a live rider online. A rider whose heartbeat already lapsed is NOT revived by polling.
  const live = !!raw && raw.online && isFresh(raw);
  if (live) await repo.touchRider(a.id);
  const info = raw ? { ...raw, online: live, lastSeenAt: live ? new Date().toISOString() : raw.lastSeenAt } : raw;
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
/** When a real campus polygon exists, a landmark can never be saved outside it. Without a polygon there is nothing to check against. */
async function assertInsideCampus(repo: Repo, p: { latitude: number; longitude: number }) {
  const boundary = await repo.getBoundary();
  if (boundary && !pointInPolygon(p, boundary))
    throw new ApiError(422, "OUTSIDE_CAMPUS", "That point is outside the campus service area. Choose a place on campus.");
}

export async function nearestLandmark(repo: Repo, point: { latitude: number; longitude: number }): Promise<NearestResult> {
  const max = nearestMaxMeters();
  const boundary = await repo.getBoundary();
  if (boundary && !pointInPolygon(point, boundary)) return { match: null, nearby: [], reason: "outside_campus", maxMeters: max };
  return nearestLandmarks(point, (await repo.listLocations()).filter((l) => l.pickupAllowed), max);
}

export async function adminAddLocation(repo: Repo, actor: Actor | null, input: AddLocationInput): Promise<Loc> {
  const a = requireRole(actor, "admin");
  if (input.latitude !== undefined && input.longitude !== undefined) await assertInsideCampus(repo, { latitude: input.latitude, longitude: input.longitude });
  return repo.addLocation({ name: input.name, description: input.description, latitude: input.latitude, longitude: input.longitude,
    source: input.source, pickupAllowed: input.pickupAllowed, destinationAllowed: input.destinationAllowed }, a.id);
}

export async function adminSetLocationPosition(repo: Repo, actor: Actor | null, id: string, input: SetLocationPositionInput): Promise<Loc> {
  const a = requireRole(actor, "admin");
  const cur = await findLocation(repo, id);
  if (cur.status === "verified" && !input.confirmReplaceVerified)
    throw new ApiError(409, "VERIFIED_LOCATION", "This landmark is ground verified. Moving it removes that verification. Confirm to continue.");
  await assertInsideCampus(repo, { latitude: input.latitude, longitude: input.longitude });
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
