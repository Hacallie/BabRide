import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { createRideSchema, vehicleCapacitySchema } from "@/lib/schemas";
import { adminSetVehicleCapacity, assertCapacity, createRide, riderRequests, riderSetOnline, rideAction } from "@/lib/service";
import { maxPassengers } from "@/lib/config";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const base = (key: string, passengerCount?: number, who = student) => ({ pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash" as const, idempotencyKey: key, ...(passengerCount === undefined ? {} : { passengerCount }) });
beforeEach(() => resetMemoryStore());
afterEach(() => vi.unstubAllEnvs());

describe("passenger count on a booking", () => {
  it("defaults to 1 and is stored and returned", async () => {
    expect((await createRide(repo, student, base("pax-key-0001"))).passengerCount).toBe(1);
    expect((await createRide(repo, other, base("pax-key-0002", 3))).passengerCount).toBe(3);
  });
  it("never changes the fare: ₦200 per ride for 1 or 3 passengers", async () => {
    const a = await createRide(repo, student, base("pax-key-0003", 1));
    const b = await createRide(repo, other, base("pax-key-0004", 3));
    expect(a.fareKobo).toBe(20000); expect(b.fareKobo).toBe(20000);
  });
  it("refuses 0, fractions and more than the configured maximum (default 3)", async () => {
    for (const n of [0, 4, 2.5, -1]) await expect(createRide(repo, student, base(`pax-bad-${n}-key`, n))).rejects.toMatchObject({ code: "BAD_PASSENGERS" });
  });
  it("the maximum is configurable on the server and bounded to 1 to 8", async () => {
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "4");
    expect(maxPassengers()).toBe(4);
    expect((await createRide(repo, student, base("pax-key-0005", 4))).passengerCount).toBe(4);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "99"); expect(maxPassengers()).toBe(3);
    vi.stubEnv("BABRIDE_MAX_PASSENGERS", "abc"); expect(maxPassengers()).toBe(3);
  });
  it("the request schema coerces, defaults, strips a client fare, and accepts a landmark or a GPS pickup only", () => {
    const ok = createRideSchema.parse({ ...base("schema-key-01", undefined), passengerCount: "2", fareKobo: 1 });
    expect(ok.passengerCount).toBe(2); expect("fareKobo" in ok).toBe(false);
    expect(createRideSchema.parse(base("schema-key-02")).passengerCount).toBe(1);
    expect(createRideSchema.safeParse({ ...base("schema-key-03"), pickup: {} }).success).toBe(false);
    expect(createRideSchema.safeParse({ ...base("schema-key-04"), pickup: { latitude: 6.9, longitude: 3.7 } }).success).toBe(true);
    expect(createRideSchema.safeParse({ ...base("schema-key-05"), pickup: { latitude: 6.9 } }).success).toBe(false);
    expect(createRideSchema.safeParse({ ...base("schema-key-06"), passengerCount: 0 }).success).toBe(false);
  });
});

describe("vehicle capacity is enforced on the server", () => {
  it("a single passenger fits any approved vehicle, even with unconfirmed capacity", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await riderSetOnline(repo, pending, true);
    const ride = await createRide(repo, student, base("cap-key-0001", 1));
    expect((await rideAction(repo, pending, ride.id, "accept")).status).toBe("assigned");
  });
  it("a group cannot be accepted by a vehicle whose capacity nobody confirmed", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin"); await riderSetOnline(repo, pending, true);
    const ride = await createRide(repo, student, base("cap-key-0002", 2));
    await expect(rideAction(repo, pending, ride.id, "accept")).rejects.toMatchObject({ code: "CAPACITY_UNVERIFIED", status: 409 });
    expect((await repo.getRide(ride.id))?.status).toBe("searching"); // untouched: still available to others
  });
  it("a group needs enough confirmed seats; the admin sets seats and the rider can then accept", async () => {
    await riderSetOnline(repo, rider, true);
    await adminSetVehicleCapacity(repo, admin, "test-rider", 2);
    const ride = await createRide(repo, student, base("cap-key-0003", 3));
    await expect(rideAction(repo, rider, ride.id, "accept")).rejects.toMatchObject({ code: "OVER_CAPACITY" });
    await adminSetVehicleCapacity(repo, admin, "test-rider", 3);
    expect((await rideAction(repo, rider, ride.id, "accept")).passengerCount).toBe(3);
  });
  it("the database-level check backs up the service check (repo refuses on its own)", async () => {
    await riderSetOnline(repo, rider, true);
    await adminSetVehicleCapacity(repo, admin, "test-rider", 2);
    const ride = await createRide(repo, student, base("cap-key-0004", 3));
    await expect(repo.acceptRide(ride.id, "test-rider")).rejects.toMatchObject({ code: "OVER_CAPACITY" });
  });
  it("assertCapacity rules", () => {
    const v = (capacity: number, capacityVerified: boolean) => ({ userId: "x", name: "x", approval: "approved" as const, online: true, vehicle: { registration: null, approval: "approved" as const, capacity, capacityVerified } });
    expect(() => assertCapacity(v(1, false), 1)).not.toThrow();
    expect(() => assertCapacity(v(3, true), 3)).not.toThrow();
    expect(() => assertCapacity(v(3, false), 2)).toThrow();
    expect(() => assertCapacity(v(2, true), 3)).toThrow();
    expect(() => assertCapacity({ ...v(3, true), vehicle: null }, 2)).toThrow();
  });
  it("only an admin can confirm seats, and only 1 to 8", async () => {
    await expect(adminSetVehicleCapacity(repo, rider, "test-rider", 3)).rejects.toMatchObject({ status: 403 });
    await expect(adminSetVehicleCapacity(repo, null, "test-rider", 3)).rejects.toMatchObject({ status: 401 });
    await expect(adminSetVehicleCapacity(repo, admin, "test-rider", 9)).rejects.toMatchObject({ code: "BAD_CAPACITY" });
    await expect(adminSetVehicleCapacity(repo, admin, "ghost", 3)).rejects.toMatchObject({ status: 404 });
    expect(vehicleCapacitySchema.safeParse({ capacity: 0 }).success).toBe(false);
    expect(vehicleCapacitySchema.parse({ capacity: "3" }).capacity).toBe(3);
    expect((await adminSetVehicleCapacity(repo, admin, "test-rider-pending", 4)).vehicle).toMatchObject({ capacity: 4, capacityVerified: true });
  });
  it("riders see the passenger count before accepting, still without the student's identity", async () => {
    await riderSetOnline(repo, rider, true);
    await createRide(repo, student, base("cap-key-0005", 2));
    const feed = await riderRequests(repo, rider);
    expect(feed.requests[0]).toMatchObject({ passengerCount: 2, studentId: "" });
  });
});
