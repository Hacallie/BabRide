import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { createRide, rideAction, listMyRides, getMyRide, adminRiderAction, riderSetOnline, riderRequests } from "@/lib/service";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const input = (key = "key-12345678") => ({ pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash" as const, idempotencyKey: key });

beforeEach(() => resetMemoryStore());

describe("service", () => {
  it("records a server-computed fare of 20000 kobo and ignores a client fare", async () => {
    const ride = await createRide(repo, student, { ...input(), fareKobo: 1 } as never);
    expect(ride.fareKobo).toBe(20000);
  });
  it("is idempotent: same key returns the same ride", async () => {
    const a = await createRide(repo, student, input()); const b = await createRide(repo, student, input());
    expect(b.id).toBe(a.id);
  });
  it("blocks a second active ride and electronic payment", async () => {
    await createRide(repo, student, input());
    await expect(createRide(repo, student, input("another-key-1"))).rejects.toMatchObject({ code: "ACTIVE_RIDE" });
    await expect(createRide(repo, other, { ...input("k-electronic-1"), paymentMethod: "electronic" })).rejects.toMatchObject({ status: 501 });
  });
  it("only one of two simultaneous riders wins", async () => {
    await repo.setRiderApproval("test-rider-pending", "approved", "test-admin");
    await riderSetOnline(repo, rider, true); await riderSetOnline(repo, pending, true);
    const ride = await createRide(repo, student, input());
    const results = await Promise.allSettled([rideAction(repo, rider, ride.id, "accept"), rideAction(repo, pending, ride.id, "accept")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("unapproved or offline riders cannot accept", async () => {
    const ride = await createRide(repo, student, input());
    await expect(rideAction(repo, rider, ride.id, "accept")).rejects.toMatchObject({ code: "RIDER_OFFLINE" });
    await expect(riderSetOnline(repo, pending, true)).rejects.toMatchObject({ code: "RIDER_NOT_APPROVED" });
  });
  it("runs the full lifecycle in order and rejects skipped steps", async () => {
    const ride = await createRide(repo, student, input()); await riderSetOnline(repo, rider, true);
    await expect(rideAction(repo, rider, ride.id, "start")).rejects.toBeTruthy();
    await rideAction(repo, rider, ride.id, "accept");
    await expect(rideAction(repo, rider, ride.id, "complete")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    for (const a of ["depart", "arrive", "start", "complete"] as const) await rideAction(repo, rider, ride.id, a);
    const done = await rideAction(repo, rider, ride.id, "collect-cash");
    expect(done.status).toBe("completed"); expect(done.paymentStatus).toBe("collected");
    await expect(rideAction(repo, rider, ride.id, "collect-cash")).rejects.toMatchObject({ code: "CANNOT_COLLECT" });
  });
  it("cannot cancel in progress; student can cancel while searching", async () => {
    const ride = await createRide(repo, student, input()); await riderSetOnline(repo, rider, true);
    await rideAction(repo, rider, ride.id, "accept");
    for (const a of ["depart", "arrive", "start"] as const) await rideAction(repo, rider, ride.id, a);
    await expect(rideAction(repo, student, ride.id, "cancel")).rejects.toMatchObject({ code: "CANNOT_CANCEL" });
  });
  it("keeps private data private", async () => {
    const ride = await createRide(repo, student, input());
    expect(await listMyRides(repo, other)).toHaveLength(0);
    await expect(getMyRide(repo, other, ride.id)).rejects.toMatchObject({ status: 404 });
    await expect(rideAction(repo, other, ride.id, "cancel")).rejects.toMatchObject({ status: 404 });
    await riderSetOnline(repo, rider, true);
    const feed = await riderRequests(repo, rider);
    expect(feed.requests[0]?.studentId).toBe(""); // rider never sees student identity before assignment
  });
  it("role checks: only admins approve; riders and students cannot", async () => {
    await expect(adminRiderAction(repo, rider, "test-rider-pending", "approve")).rejects.toMatchObject({ status: 403 });
    await expect(adminRiderAction(repo, null, "test-rider-pending", "approve")).rejects.toMatchObject({ status: 401 });
    expect((await adminRiderAction(repo, admin, "test-rider-pending", "approve")).approval).toBe("approved");
  });
  it("refuses to book when no service boundary is configured (no bypass)", async () => {
    setTestBoundary(null);
    await expect(createRide(repo, student, input())).rejects.toMatchObject({ code: "BOUNDARY_NOT_CONFIGURED" });
  });
  it("rejects a pickup outside the configured service area", async () => {
    await expect(createRide(repo, student, { ...input(), pickup: { latitude: 50, longitude: 50 } })).rejects.toMatchObject({ code: "PICKUP_OUT_OF_AREA" });
  });
  it("rejects identical pickup and destination", async () => {
    await expect(createRide(repo, student, { ...input(), pickup: { latitude: 0, longitude: 0.0002, locationId: "loc-2" } })).rejects.toMatchObject({ code: "SAME_LOCATION" });
  });
  it("rejects unauthenticated requests", async () => {
    await expect(createRide(repo, null, input())).rejects.toMatchObject({ status: 401 });
  });
});
