import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { createRideSchema, vehicleCapacitySchema } from "@/lib/schemas";
import { adminSetVehicleCapacity, assertCapacity, assertPassengers, createRide, quote, riderRequests, riderSetOnline, rideAction } from "@/lib/service";
import { maxPassengers, maxVehicleSeats } from "@/lib/config";
import { FARE_PER_PASSENGER_KOBO, totalFareKobo } from "@/lib/fare";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const base = (key: string, passengerCount?: number) => ({ pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash" as const, idempotencyKey: key, ...(passengerCount === undefined ? {} : { passengerCount }) });
beforeEach(async () => { resetMemoryStore(); await adminSetVehicleCapacity(repo, admin, "test-rider", 4); }); // the fixture rider's keke seats 4
afterEach(() => vi.unstubAllEnvs());

describe("fare = ₦200 x passengers (computed on the server)", () => {
  it("1, 2, 3 and 4 passengers cost ₦200, ₦400, ₦600 and ₦800 (kobo: 20000 per passenger)", () => {
    expect(FARE_PER_PASSENGER_KOBO).toBe(20000);
    expect([1, 2, 3, 4].map(totalFareKobo)).toEqual([20000, 40000, 60000, 80000]);
  });
  it("a quote carries per-passenger and total fare, and the stored ride matches it", async () => {
    for (const n of [1, 2, 3, 4]) {
      const q = await quote(repo, { locationId: "loc-1" }, "loc-2", n);
      expect(q).toMatchObject({ fareKobo: 20000 * n, farePerPassengerKobo: 20000, passengerCount: n });
      resetMemoryStore(); await adminSetVehicleCapacity(repo, admin, "test-rider", 4);
      const ride = await createRide(repo, student, base(`fare-key-000${n}`, n));
      expect(ride).toMatchObject({ passengerCount: n, farePerPassengerKobo: 20000, fareKobo: 20000 * n });
    }
  });
  it("defaults to 1 passenger (₦200)", async () => {
    expect(await createRide(repo, student, base("fare-key-default"))).toMatchObject({ passengerCount: 1, fareKobo: 20000 });
  });
  it("never trusts a fare sent by the client", async () => {
    const parsed = createRideSchema.parse({ ...base("fare-key-client", 2), fareKobo: 1, fare: 1, farePerPassengerKobo: 1 });
    expect("fareKobo" in parsed || "fare" in parsed || "farePerPassengerKobo" in parsed).toBe(false);
    const ride = await createRide(repo, student, { ...base("fare-key-client", 2), fareKobo: 1 } as never);
    expect(ride.fareKobo).toBe(40000);
  });
  it("does not depend on distance (same total for near and far landmarks)", async () => {
    const near = await quote(repo, { locationId: "loc-1" }, "loc-2", 2); const far = await quote(repo, { locationId: "loc-1" }, "loc-7", 2);
    expect(near.fareKobo).toBe(far.fareKobo);
  });
});

describe("passenger count validation", () => {
  it("refuses 0, negatives, fractions and anything above the configured maximum (default 4)", async () => {
    expect(maxPassengers()).toBe(4);
    for (const n of [0, 5, 2.5, -1, Number.NaN]) await expect(createRide(repo, student, base(`pax-bad-${n}-key`, n))).rejects.toMatchObject({ code: "BAD_PASSENGERS" });
    for (const n of [0, 5, 1.5, -2]) await expect(quote(repo, { locationId: "loc-1" }, "loc-2", n)).rejects.toMatchObject({ code: "BAD_PASSENGERS" });
    expect(() => assertPassengers(3)).not.toThrow();
  });
  it("the maximum is configurable on the server and bounded to 1 to 8", () => {
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "6"); expect(maxPassengers()).toBe(6);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "99"); expect(maxPassengers()).toBe(4);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "abc"); expect(maxPassengers()).toBe(4);
    vi.stubEnv("BABRIDE_MAX_VEHICLE_SEATS", "5"); expect(maxVehicleSeats()).toBe(5);
    vi.stubEnv("BABRIDE_MAX_VEHICLE_SEATS", "0"); expect(maxVehicleSeats()).toBe(6);
  });
  it("the request schema coerces, defaults and strips unknown keys; GPS pickups still need both coordinates", () => {
    const ok = createRideSchema.parse({ ...base("schema-key-01"), passengerCount: "2", fareKobo: 1 });
    expect(ok.passengerCount).toBe(2); expect("fareKobo" in ok).toBe(false);
    expect(createRideSchema.parse(base("schema-key-02")).passengerCount).toBe(1);
    expect(createRideSchema.safeParse({ ...base("schema-key-03"), pickup: {} }).success).toBe(false);
    expect(createRideSchema.safeParse({ ...base("schema-key-04"), pickup: { latitude: 6.9, longitude: 3.7 } }).success).toBe(true);
    expect(createRideSchema.safeParse({ ...base("schema-key-06"), passengerCount: 0 }).success).toBe(false);
  });
});

describe("seat capacity is enforced on the server", () => {
  it("a booking for more passengers than ANY registered keke seats is rejected up front, with a reason", async () => {
    await adminSetVehicleCapacity(repo, admin, "test-rider", 2);
    await expect(createRide(repo, student, base("cap-key-0001", 3))).rejects.toMatchObject({ code: "OVER_CAPACITY", status: 409, message: expect.stringContaining("seats 2") });
    expect(await repo.listAllRides(10)).toHaveLength(0); // nothing was created, so nothing can be charged
  });
  it("a group needs a keke whose declared seats cover it; one that is too small cannot accept it", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); // a second, bigger keke exists
    await adminSetVehicleCapacity(repo, admin, "test-rider-pending", 4);
    await adminSetVehicleCapacity(repo, admin, "test-rider", 2);
    await riderSetOnline(repo, rider, true);
    const ride = await createRide(repo, student, base("cap-key-0003", 3)); // allowed: a 4-seater exists
    await expect(rideAction(repo, rider, ride.id, "accept")).rejects.toMatchObject({ code: "OVER_CAPACITY" });
    expect((await repo.getRide(ride.id))?.status).toBe("searching"); // still available to the bigger keke
    await riderSetOnline(repo, pending, true);
    expect((await rideAction(repo, pending, ride.id, "accept")).passengerCount).toBe(3);
  });
  it("the repository refuses on its own too (database-level rule mirrored)", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await adminSetVehicleCapacity(repo, admin, "test-rider-pending", 4);
    await adminSetVehicleCapacity(repo, admin, "test-rider", 2); await riderSetOnline(repo, rider, true);
    const ride = await createRide(repo, student, base("cap-key-0004", 3));
    await expect(repo.acceptRide(ride.id, "test-rider")).rejects.toMatchObject({ code: "OVER_CAPACITY" });
  });
  it("a single passenger fits any approved vehicle, even one whose capacity was never recorded", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin");
    const v = (await repo.getRider("test-rider-pending"))!.vehicle!; v.capacityVerified = false;
    await riderSetOnline(repo, pending, true);
    const ride = await createRide(repo, student, base("cap-key-0002", 1));
    expect((await rideAction(repo, pending, ride.id, "accept")).status).toBe("assigned");
  });
  it("assertCapacity rules: no silent assumption of any capacity", () => {
    const v = (capacity: number, capacityVerified: boolean) => ({ userId: "x", name: "x", approval: "approved" as const, online: true, vehicle: { registration: null, approval: "approved" as const, capacity, capacityVerified } });
    expect(() => assertCapacity(v(1, false), 1)).not.toThrow();
    expect(() => assertCapacity(v(3, true), 3)).not.toThrow();
    expect(() => assertCapacity(v(3, false), 2)).toThrow();
    expect(() => assertCapacity(v(2, true), 3)).toThrow();
    expect(() => assertCapacity({ ...v(3, true), vehicle: null }, 2)).toThrow();
  });
  it("only an admin can set seats, within the configured limit", async () => {
    await expect(adminSetVehicleCapacity(repo, rider, "test-rider", 3)).rejects.toMatchObject({ status: 403 });
    await expect(adminSetVehicleCapacity(repo, null, "test-rider", 3)).rejects.toMatchObject({ status: 401 });
    await expect(adminSetVehicleCapacity(repo, admin, "test-rider", 7)).rejects.toMatchObject({ code: "BAD_CAPACITY" });
    await expect(adminSetVehicleCapacity(repo, admin, "ghost", 3)).rejects.toMatchObject({ status: 404 });
    expect(vehicleCapacitySchema.safeParse({ capacity: 0 }).success).toBe(false);
    expect((await adminSetVehicleCapacity(repo, admin, "test-rider-pending", 4)).vehicle).toMatchObject({ capacity: 4, capacityVerified: true });
  });
  it("riders see the passenger count and per-passenger fare before accepting, still without the student's identity", async () => {
    await riderSetOnline(repo, rider, true);
    await createRide(repo, student, base("cap-key-0005", 2));
    const feed = await riderRequests(repo, rider);
    expect(feed.requests[0]).toMatchObject({ passengerCount: 2, fareKobo: 40000, studentId: "" });
  });
});
