import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { createRideSchema, passengerSeatsSchema, riderApplySchema, vehicleCapacitySchema } from "@/lib/schemas";
import { adminRiderAction, adminSetVehicleCapacity, assertCapacity, createRide, quote, riderApply, riderRequests, riderSetOnline, rideAction } from "@/lib/service";
import { maxPassengers, maxVehicleSeats } from "@/lib/config";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const book = (key: string, passengerCount?: number) => ({ pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash" as const, idempotencyKey: key, ...(passengerCount === undefined ? {} : { passengerCount }) });
beforeEach(() => resetMemoryStore());
afterEach(() => vi.unstubAllEnvs());

describe("fare = ₦200 x passengers, computed on the server", () => {
  it("quotes 1, 2, 3 and 4 passengers as ₦200, ₦400, ₦600 and ₦800 (20000 kobo each)", async () => {
    const totals: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      const q = await quote(repo, { locationId: "loc-1" }, "loc-2", n);
      expect(q).toMatchObject({ farePerPassengerKobo: 20000, passengerCount: n });
      totals.push(q.fareKobo);
    }
    expect(totals).toEqual([20000, 40000, 60000, 80000]);
  });
  it("stores the passenger count and the total with the ride, and the per-passenger figure is derivable", async () => {
    await adminSetVehicleCapacity(repo, admin, "test-rider", 4);
    const ride = await createRide(repo, student, book("fare-key-0001", 3));
    expect(ride).toMatchObject({ passengerCount: 3, fareKobo: 60000, farePerPassengerKobo: 20000 });
    expect((await repo.getRide(ride.id))?.fareKobo).toBe(60000);
  });
  it("ignores any fare the browser sends", async () => {
    const parsed = createRideSchema.parse({ ...book("fare-key-0002", 2), fareKobo: 1, fare: 1, total: 1 });
    expect(Object.keys(parsed).sort()).toEqual(["destinationLocationId", "idempotencyKey", "passengerCount", "paymentMethod", "pickup"]);
    expect((await createRide(repo, student, parsed)).fareKobo).toBe(40000);
  });
  it("is the same whichever pair of landmarks is chosen (no distance charge)", async () => {
    const a = await quote(repo, { locationId: "loc-1" }, "loc-2", 2); const b = await quote(repo, { locationId: "loc-3" }, "loc-7", 2);
    expect(a.fareKobo).toBe(40000); expect(b.fareKobo).toBe(40000);
  });
  it("refuses 0, negatives, fractions and more than the configured maximum (default 4)", async () => {
    expect(maxPassengers()).toBe(4);
    for (const n of [0, -1, 2.5, 5]) await expect(createRide(repo, student, book(`bad-pax-${n}-key`, n))).rejects.toMatchObject({ code: "BAD_PASSENGERS" });
    await expect(quote(repo, { locationId: "loc-1" }, "loc-2", 0)).rejects.toMatchObject({ code: "BAD_PASSENGERS" });
  });
  it("the maximum is configurable on the server and bounded to 1 to 8", () => {
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "6"); expect(maxPassengers()).toBe(6);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "99"); expect(maxPassengers()).toBe(4);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "abc"); expect(maxPassengers()).toBe(4);
  });
  it("the request schema coerces, defaults to 1, and rejects an unusable pickup", () => {
    expect(createRideSchema.parse({ ...book("schema-key-01"), passengerCount: "2" }).passengerCount).toBe(2);
    expect(createRideSchema.parse(book("schema-key-02")).passengerCount).toBe(1);
    expect(createRideSchema.safeParse({ ...book("schema-key-03"), pickup: {} }).success).toBe(false);
    expect(createRideSchema.safeParse({ ...book("schema-key-04"), passengerCount: 0 }).success).toBe(false);
  });
});

describe("a booking no keke can carry is refused up front, with the reason", () => {
  it("rejects 4 passengers while the largest confirmed keke seats 3, and accepts once a bigger one is confirmed", async () => {
    await expect(createRide(repo, student, book("fit-key-0001", 4))).rejects.toMatchObject({ code: "NO_KEKE_FITS", status: 422, message: expect.stringMatching(/seats 3/) });
    await adminSetVehicleCapacity(repo, admin, "test-rider", 4);
    expect((await createRide(repo, student, book("fit-key-0002", 4))).fareKobo).toBe(80000);
  });
});

describe("seat capacity is enforced when a rider accepts", () => {
  it("a single passenger fits any approved vehicle, even with unconfirmed capacity", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await riderSetOnline(repo, pending, true);
    await repo.setVehicleCapacity("test-rider-pending", 1, "x"); // 1 seat, confirmed
    expect((await rideAction(repo, pending, (await createRide(repo, student, book("cap-key-0001", 1))).id, "accept")).status).toBe("assigned");
  });
  it("a keke with too few seats cannot take a bigger group (while another keke could)", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await repo.setVehicleCapacity("test-rider-pending", 4, "x");
    await riderSetOnline(repo, rider, true); // seats 3
    const ride = await createRide(repo, student, book("cap-key-0002", 4)); // allowed: the pending-turned-approved keke seats 4
    await expect(rideAction(repo, rider, ride.id, "accept")).rejects.toMatchObject({ code: "OVER_CAPACITY", status: 409 });
    expect((await repo.getRide(ride.id))?.status).toBe("searching"); // untouched, still open to a bigger keke
    await riderSetOnline(repo, pending, true);
    expect((await rideAction(repo, pending, ride.id, "accept")).passengerCount).toBe(4);
  });
  it("a group cannot go to a keke whose seats nobody confirmed", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin");
    await repo.setVehicleCapacity("test-rider-pending", 4, "x");
    await riderSetOnline(repo, rider, true);
    const info = await repo.getRider("test-rider")!; // verified 3
    expect(info?.vehicle?.capacityVerified).toBe(true);
    expect(() => assertCapacity({ ...info!, vehicle: { ...info!.vehicle!, capacityVerified: false } }, 2)).toThrow();
  });
  it("the repo (the database function in production) refuses on its own too", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await repo.setVehicleCapacity("test-rider-pending", 4, "x");
    await riderSetOnline(repo, rider, true);
    const ride = await createRide(repo, student, book("cap-key-0003", 4));
    await expect(repo.acceptRide(ride.id, "test-rider")).rejects.toMatchObject({ code: "OVER_CAPACITY" });
  });
  it("riders see the passenger count and the total before accepting, still without the student's identity", async () => {
    await riderSetOnline(repo, rider, true);
    await createRide(repo, student, book("cap-key-0004", 2));
    expect((await riderRequests(repo, rider)).requests[0]).toMatchObject({ passengerCount: 2, fareKobo: 40000, studentId: "" });
  });
  it("assertCapacity rules", () => {
    const v = (capacity: number, capacityVerified: boolean) => ({ userId: "x", name: "x", approval: "approved" as const, online: true, lastSeenAt: null, vehicle: { registration: null, approval: "approved" as const, capacity, capacityVerified, capacityDeclared: true } });
    expect(() => assertCapacity(v(1, false), 1)).not.toThrow();
    expect(() => assertCapacity(v(3, true), 3)).not.toThrow();
    expect(() => assertCapacity(v(3, false), 2)).toThrow();
    expect(() => assertCapacity(v(2, true), 3)).toThrow();
    expect(() => assertCapacity({ ...v(3, true), vehicle: null }, 2)).toThrow();
  });
});

describe("rider registration collects the passenger seats", () => {
  it("is required, a positive whole number, and limited by a server-side configurable maximum (default 6)", async () => {
    expect(maxVehicleSeats()).toBe(6);
    expect(riderApplySchema.safeParse({}).success).toBe(false);
    for (const bad of [0, -2, 2.5, "x", 9]) expect(passengerSeatsSchema.safeParse(bad).success).toBe(false);
    expect(passengerSeatsSchema.parse("4")).toBe(4);
    for (const bad of [0, 7, 2.5, NaN]) await expect(riderApply(repo, other, undefined, bad)).rejects.toMatchObject({ code: "BAD_SEATS", status: 422 });
    vi.stubEnv("BABRIDE_MAX_VEHICLE_SEATS", "8"); expect(maxVehicleSeats()).toBe(8);
  });
  it("saves the declared seats on a pending application; they are unconfirmed until an administrator approves", async () => {
    const r = await riderApply(repo, other, "AB-123", 4);
    expect(r).toMatchObject({ approval: "pending", vehicle: { capacity: 4, capacityDeclared: true, capacityVerified: false } });
    // not confirmed, so the group-limit check cannot count this keke yet
    expect(await repo.maxVerifiedCapacity()).toBe(3);
    const approved = await adminRiderAction(repo, admin, other.id, "approve");
    expect(approved.vehicle).toMatchObject({ capacity: 4, capacityVerified: true });
    expect(await repo.maxVerifiedCapacity()).toBe(4);
  });
  it("only an admin can confirm seats, and only 1 to 8", async () => {
    await expect(adminSetVehicleCapacity(repo, rider, "test-rider", 3)).rejects.toMatchObject({ status: 403 });
    await expect(adminSetVehicleCapacity(repo, null, "test-rider", 3)).rejects.toMatchObject({ status: 401 });
    await expect(adminSetVehicleCapacity(repo, admin, "test-rider", 9)).rejects.toMatchObject({ code: "BAD_CAPACITY" });
    await expect(adminSetVehicleCapacity(repo, admin, "ghost", 3)).rejects.toMatchObject({ status: 404 });
    expect(vehicleCapacitySchema.safeParse({ capacity: 0 }).success).toBe(false);
  });
});
