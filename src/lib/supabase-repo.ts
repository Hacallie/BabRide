// SERVER ONLY. Supabase implementation of Repo. NOT yet tested against a live project.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Boundary, LngLat } from "@/lib/fare";
import type { RideStatus } from "@/lib/ride-state";
import type { Loc, LocSource, LocStatus, Ride, RiderApproval, RiderInfo } from "@/lib/types";
import type { LocationDetailsPatch, NewLoc, NewRide, Repo } from "@/lib/repo";
import { adminClient } from "@/lib/supabase-admin";
import { ApiError } from "@/lib/errors";
import { deriveLocation } from "@/lib/loc-derive";

interface RideRow {
  id: string; student_id: string; assigned_rider_id: string | null;
  pickup_latitude: number | null; pickup_longitude: number | null; pickup_location_id: string | null; passenger_count: number | null;
  destination_location_id: string; fare_amount_kobo: number; currency: string;
  payment_method: "cash" | "electronic"; payment_status: "outstanding" | "collected";
  status: RideStatus; requested_at: string; cancellation_reason: string | null;
  destination: { id: string; name: string } | null; pickup: { name: string } | null;
  student: { full_name: string } | null; rider: { full_name: string } | null;
}
interface LocRow {
  id: string; name: string; description: string | null; latitude: number; longitude: number;
  is_verified: boolean; is_pickup_allowed: boolean; is_destination_allowed: boolean; is_active: boolean;
  location_source: LocSource | null;
}
interface RiderRow {
  user_id: string; approval_status: RiderApproval; is_online: boolean; last_seen_at: string | null;
  profile: { full_name: string } | null;
  vehicles: { registration_number: string | null; approval_status: "pending" | "approved" | "rejected"; capacity: number | null; capacity_verified: boolean | null; capacity_declared: boolean | null }[] | null;
}

const RIDE_SELECT = "*, destination:campus_locations!rides_destination_location_id_fkey(id,name), " +
  "pickup:campus_locations!rides_pickup_location_id_fkey(name), " +
  "student:profiles!rides_student_id_fkey(full_name), rider:profiles!rides_assigned_rider_id_fkey(full_name)";
const RIDER_SELECT = "user_id, approval_status, is_online, profile:profiles!rider_profiles_user_id_fkey(full_name), vehicles(registration_number, approval_status, capacity, capacity_verified, capacity_declared)";
const TS: Partial<Record<RideStatus, string>> = {
  rider_arrived: "rider_arrived_at", in_progress: "started_at", completed: "completed_at", cancelled: "cancelled_at",
};

const mapLoc = (l: LocRow): Loc => ({
  id: l.id, name: l.name, description: l.description ?? "", latitude: l.latitude, longitude: l.longitude,
  verified: l.is_verified && deriveLocation(l).status === "verified", status: deriveLocation(l).status, source: deriveLocation(l).source, pickupAllowed: l.is_pickup_allowed, destinationAllowed: l.is_destination_allowed, active: l.is_active,
});
const mapRider = (r: RiderRow): RiderInfo => {
  const v = r.vehicles?.[0];
  return { userId: r.user_id, name: r.profile?.full_name ?? "Rider", approval: r.approval_status, online: r.is_online, lastSeenAt: r.last_seen_at,
    vehicle: v ? { registration: v.registration_number, approval: v.approval_status, capacity: v.capacity ?? 3, capacityVerified: v.capacity_verified === true, capacityDeclared: v.capacity_declared === true } : null };
};

class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  private db: SupabaseClient = adminClient();
  private instId?: string;

  private async institutionId(): Promise<string> {
    if (this.instId) return this.instId;
    const { data, error } = await this.db.from("institutions").select("id").eq("slug", "babcock").single();
    if (error || !data) throw new ApiError(503, "NOT_SEEDED", "Database is not seeded. Run supabase/seed.sql.");
    return (this.instId = data.id as string);
  }
  private fail(e: { message: string; code?: string }, status = 500): never {
    console.error("db error", e.code ?? "", e.message);
    // 42703 undefined column, 42P01 undefined table, PGRST204/PGRST200 not in the schema cache: a migration has not been applied.
    if (e.code && ["42703", "42P01", "PGRST204", "PGRST200", "PGRST205"].includes(e.code))
      throw new ApiError(503, "MIGRATION_MISSING", "The database is missing a migration. The owner must apply every file in supabase/migrations (up to 0006), then try again.");
    throw new ApiError(status, "DB_ERROR", "Something went wrong. Please try again.");
  }
  private async mapRides(rows: RideRow[]): Promise<Ride[]> {
    const riderIds = [...new Set(rows.map((r) => r.assigned_rider_id).filter((x): x is string => !!x))];
    const regs = new Map<string, string | null>();
    if (riderIds.length) {
      const { data } = await this.db.from("vehicles").select("rider_id, registration_number")
        .in("rider_id", riderIds).eq("approval_status", "approved");
      for (const v of (data ?? []) as { rider_id: string; registration_number: string | null }[]) regs.set(v.rider_id, v.registration_number);
    }
    return rows.map((r) => ({
      id: r.id, studentId: r.student_id, studentName: r.student?.full_name ?? "Student",
      riderId: r.assigned_rider_id, riderName: r.rider?.full_name ?? null,
      vehicleReg: r.assigned_rider_id ? regs.get(r.assigned_rider_id) ?? null : null,
      pickup: { latitude: r.pickup_latitude, longitude: r.pickup_longitude, locationId: r.pickup_location_id, label: r.pickup?.name ?? "GPS pin" },
      destination: { id: r.destination_location_id, name: r.destination?.name ?? "Destination" },
      fareKobo: r.fare_amount_kobo, currency: r.currency, passengerCount: r.passenger_count ?? 1, farePerPassengerKobo: Math.round(r.fare_amount_kobo / (r.passenger_count ?? 1)), paymentMethod: r.payment_method, paymentStatus: r.payment_status,
      status: r.status, requestedAt: r.requested_at, cancellationReason: r.cancellation_reason,
    }));
  }
  private async rides(build: (q: ReturnType<SupabaseClient["from"]>) => unknown): Promise<Ride[]> {
    const q = build(this.db.from("rides")) as PromiseLike<{ data: RideRow[] | null; error: { message: string } | null }>;
    const { data, error } = await q; if (error) this.fail(error);
    return this.mapRides(data ?? []);
  }
  private async one(id: string) { return (await this.rides((t) => t.select(RIDE_SELECT).eq("id", id)))[0] ?? null; }

  async getBoundary(): Promise<Boundary> {
    const { data } = await this.db.from("institutions").select("campus_boundary").eq("slug", "babcock").single();
    const b = data?.campus_boundary as unknown;
    return Array.isArray(b) && b.length >= 3 ? (b as LngLat[]) : null;
  }
  async listLocations(all = false) {
    let q = this.db.from("campus_locations").select("*").eq("institution_id", await this.institutionId());
    if (!all) q = q.eq("is_active", true);
    const { data, error } = await q.order("name"); if (error) this.fail(error);
    return ((data ?? []) as LocRow[]).map(mapLoc);
  }
  async addLocation(l: NewLoc, adminId: string) {
    const now = new Date().toISOString();
    const located = l.latitude !== undefined && l.longitude !== undefined && l.source !== undefined;
    // is_verified is never set here: a pin is a selection, not ground verification.
    // No position given: store the 0,0 placeholder with location_source NULL, which the app reads as "Not located yet".
    const { data, error } = await this.db.from("campus_locations").insert({
      institution_id: await this.institutionId(), name: l.name, description: l.description,
      latitude: located ? l.latitude : 0, longitude: located ? l.longitude : 0, is_verified: false,
      location_source: located ? l.source : null, located_at: located ? now : null, located_by: located ? adminId : null,
      is_pickup_allowed: l.pickupAllowed, is_destination_allowed: l.destinationAllowed }).select().single();
    if (error) this.fail(error); return mapLoc(data as LocRow);
  }
  async updateLocationDetails(id: string, p: LocationDetailsPatch, _adminId: string) {
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.description !== undefined) patch.description = p.description;
    if (p.pickupAllowed !== undefined) patch.is_pickup_allowed = p.pickupAllowed;
    if (p.destinationAllowed !== undefined) patch.is_destination_allowed = p.destinationAllowed;
    if (p.active !== undefined) patch.is_active = p.active;
    patch.updated_at = new Date().toISOString();
    // Coordinates, source and verification columns are deliberately not in this patch.
    const { data, error } = await this.db.from("campus_locations").update(patch).eq("id", id)
      .eq("institution_id", await this.institutionId()).select().maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new ApiError(404, "NOT_FOUND", "Landmark not found.");
    return mapLoc(data as LocRow);
  }
  async setLocationPosition(id: string, p: { latitude: number; longitude: number; source: Exclude<LocSource, "legacy"> }, adminId: string) {
    const { data, error } = await this.db.from("campus_locations").update({
      latitude: p.latitude, longitude: p.longitude, location_source: p.source, located_at: new Date().toISOString(), located_by: adminId,
      is_verified: false, verified_at: null, verified_by: null,
    }).eq("id", id).eq("institution_id", await this.institutionId()).select().maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new ApiError(404, "NOT_FOUND", "Landmark not found.");
    return mapLoc(data as LocRow);
  }
  async verifyLocation(id: string, adminId: string) {
    const { data, error } = await this.db.from("campus_locations").update({
      is_verified: true, verified_at: new Date().toISOString(), verified_by: adminId,
    }).eq("id", id).eq("institution_id", await this.institutionId()).eq("is_verified", false).not("location_source", "is", null).select().maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new ApiError(409, "CANNOT_VERIFY", "Only a located, not-yet-verified landmark can be marked ground verified.");
    return mapLoc(data as LocRow);
  }
  async findRideByKey(studentId: string, key: string) {
    return (await this.rides((t) => t.select(RIDE_SELECT).eq("student_id", studentId).eq("idempotency_key", key)))[0] ?? null;
  }
  async activeRideFor(studentId: string) {
    return (await this.rides((t) => t.select(RIDE_SELECT).eq("student_id", studentId)
      .in("status", ["searching", "assigned", "rider_arriving", "rider_arrived", "in_progress"])))[0] ?? null;
  }
  async createRide(n: NewRide) {
    const { data, error } = await this.db.from("rides").insert({
      institution_id: await this.institutionId(), student_id: n.studentId, idempotency_key: n.idempotencyKey,
      pickup_latitude: n.pickup.latitude, pickup_longitude: n.pickup.longitude, pickup_location_id: n.pickup.locationId,
      passenger_count: n.passengerCount, destination_location_id: n.destinationLocationId, fare_amount_kobo: n.fareKobo,
      payment_method: n.paymentMethod, payment_status: "outstanding" }).select("id").single();
    if (error) {
      if (error.code === "23505") {
        const again = await this.findRideByKey(n.studentId, n.idempotencyKey);
        if (again) return again;
        throw new ApiError(409, "ACTIVE_RIDE", "You already have an active ride.");
      }
      this.fail(error);
    }
    const id = (data as { id: string }).id;
    await this.db.from("ride_status_events").insert({ ride_id: id, actor_id: n.studentId, new_status: "searching", reason: "requested" });
    return (await this.one(id))!;
  }
  getRide(id: string) { return this.one(id); }
  listStudentRides(id: string, limit: number) { return this.rides((t) => t.select(RIDE_SELECT).eq("student_id", id).order("created_at", { ascending: false }).limit(limit)); }
  listRiderRides(id: string, limit: number) { return this.rides((t) => t.select(RIDE_SELECT).eq("assigned_rider_id", id).order("created_at", { ascending: false }).limit(limit)); }
  listSearching() { return this.rides((t) => t.select(RIDE_SELECT).eq("status", "searching").order("requested_at").limit(50)); }
  listAllRides(limit: number) { return this.rides((t) => t.select(RIDE_SELECT).order("created_at", { ascending: false }).limit(limit)); }

  async transition(id: string, from: RideStatus, to: RideStatus, actorId: string, opts?: { reason?: string; clearRider?: boolean }) {
    const patch: Record<string, unknown> = { status: to };
    const col = TS[to]; if (col) patch[col] = new Date().toISOString();
    if (to === "cancelled") patch.cancellation_reason = opts?.reason ?? null;
    if (opts?.clearRider) { patch.assigned_rider_id = null; patch.assigned_at = null; }
    const { data, error } = await this.db.from("rides").update(patch).eq("id", id).eq("status", from).select("id");
    if (error) this.fail(error);
    if (!data || data.length === 0) throw new ApiError(409, "STATE_CONFLICT", "Ride status has changed. Refresh and try again.");
    await this.db.from("ride_status_events").insert({
      ride_id: id, actor_id: actorId === "system" ? null : actorId, previous_status: from, new_status: to, reason: opts?.reason ?? null });
    return (await this.one(id))!;
  }
  async acceptRide(rideId: string, riderId: string) {
    const { error } = await this.db.rpc("accept_ride_for", { p_ride: rideId, p_rider: riderId });
    if (error) {
      const m = error.message;
      if (m.includes("ride_unavailable")) throw new ApiError(409, "RIDE_UNAVAILABLE", "This ride is no longer available.");
      if (m.includes("rider_busy")) throw new ApiError(409, "RIDER_BUSY", "Finish your current ride first.");
      if (m.includes("rider_not_eligible")) throw new ApiError(403, "RIDER_NOT_APPROVED", "Your rider account is not eligible.");
      if (m.includes("capacity_unverified")) throw new ApiError(409, "CAPACITY_UNVERIFIED", "An administrator hasn't confirmed your vehicle's seat capacity yet, so you can't take a group.");
      if (m.includes("over_capacity")) throw new ApiError(409, "OVER_CAPACITY", "This ride has more passengers than your vehicle seats.");
      this.fail(error);
    }
    return (await this.one(rideId))!;
  }
  async markCashCollected(rideId: string) {
    const { error } = await this.db.from("rides").update({ payment_status: "collected" }).eq("id", rideId).eq("payment_status", "outstanding");
    if (error) this.fail(error);
    return (await this.one(rideId))!;
  }
  async getRider(id: string) {
    const { data } = await this.db.from("rider_profiles").select(RIDER_SELECT).eq("user_id", id).maybeSingle();
    return data ? mapRider(data as unknown as RiderRow) : null;
  }
  async applyRider(actorId: string, reg: string | undefined, seats: number) {
    const existing = await this.getRider(actorId); if (existing) return existing;
    const { data: prof } = await this.db.from("profiles").select("institution_id, role").eq("id", actorId).single();
    if (!prof) throw new ApiError(404, "NO_PROFILE", "Profile not found.");
    // Server-side only, and only student -> rider. An admin is never changed; nothing here can create an admin.
    const promoted = prof.role === "student";
    if (promoted) { const u = await this.db.from("profiles").update({ role: "rider" }).eq("id", actorId).eq("role", "student"); if (u.error) this.fail(u.error); }
    const undo = async () => {
      await this.db.from("rider_profiles").delete().eq("user_id", actorId);
      if (promoted) await this.db.from("profiles").update({ role: "student" }).eq("id", actorId).eq("role", "rider");
    };
    const a = await this.db.from("rider_profiles").insert({ user_id: actorId, approval_status: "pending" });
    if (a.error) { if (promoted) await this.db.from("profiles").update({ role: "student" }).eq("id", actorId).eq("role", "rider"); this.fail(a.error); }
    // The vehicle row is still created (ride acceptance needs an approved vehicle). The registration number is optional.
    const v = await this.db.from("vehicles").insert({ rider_id: actorId, institution_id: prof.institution_id, registration_number: reg ?? null, capacity: seats, capacity_declared: true, capacity_verified: false });
    if (v.error) {
      await undo();
      // 23502 = NOT NULL violation: the database still requires a registration number, i.e. migration 0005 was not applied.
      if (v.error.code === "23502") { console.error("db error: vehicles.registration_number is still NOT NULL (apply migration 0005)"); throw new ApiError(503, "MIGRATION_MISSING", "Rider applications can't be saved yet: the database is missing migration 0005. The owner must apply it, then you can try again."); }
      if (v.error.code === "23505") throw new ApiError(409, "VEHICLE_EXISTS", "That vehicle registration is already registered.");
      this.fail(v.error);
    }
    return (await this.getRider(actorId))!;
  }
  async setOnline(id: string, online: boolean) {
    const { error } = await this.db.from("rider_profiles").update({ is_online: online, last_seen_at: new Date().toISOString() }).eq("user_id", id);
    if (error) this.fail(error);
  }
  async touchRider(id: string) {
    const { error } = await this.db.from("rider_profiles").update({ last_seen_at: new Date().toISOString() }).eq("user_id", id);
    if (error) this.fail(error);
  }
  async maxVerifiedCapacity() {
    const { data, error } = await this.db.from("vehicles").select("capacity").eq("approval_status", "approved").eq("capacity_verified", true)
      .order("capacity", { ascending: false }).limit(1);
    if (error) this.fail(error);
    const c = (data as { capacity: number }[] | null)?.[0]?.capacity;
    return typeof c === "number" ? c : null;
  }
  async listRiders() {
    const { data, error } = await this.db.from("rider_profiles").select(RIDER_SELECT).order("created_at", { ascending: false }).limit(200);
    if (error) this.fail(error); return ((data ?? []) as unknown as RiderRow[]).map(mapRider);
  }
  async setRiderApproval(id: string, status: RiderApproval, adminId: string) {
    const patch: Record<string, unknown> = { approval_status: status };
    if (status === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = adminId; } else patch.is_online = false;
    const { error } = await this.db.from("rider_profiles").update(patch).eq("user_id", id);
    if (error) this.fail(error);
    await this.db.from("vehicles").update({ approval_status: status === "approved" ? "approved" : "rejected" }).eq("rider_id", id);
    // Approving a rider means the administrator reviewed the application, including the seats the rider declared: confirm those seats.
    if (status === "approved") await this.db.from("vehicles").update({ capacity_verified: true }).eq("rider_id", id).eq("capacity_declared", true);
    const r = await this.getRider(id);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    return r;
  }
  async setVehicleCapacity(riderId: string, capacity: number, _adminId: string) {
    const { error } = await this.db.from("vehicles").update({ capacity, capacity_verified: true }).eq("rider_id", riderId);
    if (error) this.fail(error);
    const r = await this.getRider(riderId);
    if (!r) throw new ApiError(404, "NOT_FOUND", "Rider not found.");
    return r;
  }
}
let inst: SupabaseRepo | undefined;
export const getSupabaseRepo = (): Repo => (inst ??= new SupabaseRepo());