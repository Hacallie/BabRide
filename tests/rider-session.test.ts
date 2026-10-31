import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ageRider, getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { riderApplySchema } from "@/lib/schemas";
import { adminRiderAction, adminSetVehicleCapacity, riderApply, riderEndSession, riderRequests, riderSetOnline, riderStartSession, rideAction, createRide } from "@/lib/service";
import { effectiveOnline, isFresh } from "@/lib/presence";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
beforeEach(() => resetMemoryStore());
afterEach(() => vi.unstubAllEnvs());

describe("riders are set online automatically after sign-in (persisted, not just UI state)", () => {
  it("an approved rider becomes Online in the repository without pressing anything", async () => {
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
    expect(await riderStartSession(repo, rider)).toEqual({ online: true, reason: null });
    expect((await repo.getRider("test-rider"))?.online).toBe(true); // read back from the store
  });
  it("is idempotent: a second device, a retry or a reconnect leaves one consistent Online state", async () => {
    await riderStartSession(repo, rider); await riderStartSession(repo, rider);
    expect(await riderStartSession(repo, rider)).toMatchObject({ online: true });
    expect((await repo.listRiders()).filter((r) => r.online)).toHaveLength(1);
  });
  it("ordinary customers can never be marked as drivers", async () => {
    await expect(riderStartSession(repo, student)).rejects.toMatchObject({ status: 403 });
    await expect(riderStartSession(repo, admin)).rejects.toMatchObject({ status: 403 });
    await expect(riderStartSession(repo, null)).rejects.toMatchObject({ status: 401 });
    expect(await repo.getRider("test-student")).toBeNull();
  });
  it("a pending (not approved) rider is NOT made available, but sign-in is not an error", async () => {
    expect(await riderStartSession(repo, pending)).toEqual({ online: false, reason: "NOT_APPROVED" });
    expect((await repo.getRider("test-rider-pending"))?.online).toBe(false);
  });
  it("a suspended rider is not made available", async () => {
    await adminRiderAction(repo, admin, "test-rider", "suspend");
    expect(await riderStartSession(repo, rider)).toEqual({ online: false, reason: "SUSPENDED" });
  });
  it("a rider with an unapproved vehicle, or no vehicle on file (incomplete profile), is not made available", async () => {
    const { riderIneligibility } = await import("@/lib/service");
    const base = { userId: "x", name: "x", approval: "approved" as const, online: false };
    expect(riderIneligibility({ ...base, vehicle: { registration: null, approval: "pending", capacity: 3, capacityVerified: true } })).toBe("VEHICLE_NOT_APPROVED");
    expect(riderIneligibility({ ...base, vehicle: null })).toBe("PROFILE_INCOMPLETE");
    expect(riderIneligibility({ ...base, vehicle: { registration: null, approval: "approved", capacity: 0, capacityVerified: true } })).toBe("PROFILE_INCOMPLETE");
    expect(riderIneligibility(null)).toBe("PROFILE_INCOMPLETE");
    expect(riderIneligibility({ ...base, vehicle: { registration: null, approval: "approved", capacity: 3, capacityVerified: true } })).toBeNull();
  });
  it("manual go-online keeps the same eligibility rules", async () => {
    await expect(riderSetOnline(repo, pending, true)).rejects.toMatchObject({ status: 403, code: "RIDER_NOT_APPROVED" });
    await riderSetOnline(repo, rider, true); expect((await repo.getRider("test-rider"))?.online).toBe(true);
  });
});

describe("going offline", () => {
  it("explicit offline and sign-out both persist Offline (and sign-out is safe to repeat)", async () => {
    await riderStartSession(repo, rider);
    await riderSetOnline(repo, rider, false); expect((await repo.getRider("test-rider"))?.online).toBe(false);
    await riderStartSession(repo, rider);
    expect(await riderEndSession(repo, rider)).toEqual({ online: false });
    await riderEndSession(repo, rider);
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
  });
  it("only a rider can use the session endpoints", async () => {
    await expect(riderEndSession(repo, student)).rejects.toMatchObject({ status: 403 });
  });
  it("suspending a rider takes them offline", async () => {
    await riderStartSession(repo, rider); await adminRiderAction(repo, admin, "test-rider", "suspend");
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
  });
});

describe("presence expiry covers closed tabs, dead phones and expired sessions", () => {
  it("isFresh / effectiveOnline", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(isFresh("2026-01-01T11:59:30Z", 120, now)).toBe(true);
    expect(isFresh("2026-01-01T11:57:00Z", 120, now)).toBe(false);
    expect(isFresh(null, 120, now)).toBe(false); expect(isFresh("garbage", 120, now)).toBe(false);
    expect(effectiveOnline(true, "2026-01-01T11:59:50Z", 120, now)).toBe(true);
    expect(effectiveOnline(false, "2026-01-01T11:59:50Z", 120, now)).toBe(false);
  });
  it("a rider who stops sending heartbeats stops being online and cannot accept rides", async () => {
    await riderStartSession(repo, rider);
    const ride = await createRide(repo, student, { pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash", idempotencyKey: "presence-key-1" });
    ageRider("test-rider", 600); // last seen 10 minutes ago, flag still set
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
    await expect(rideAction(repo, rider, ride.id, "accept")).rejects.toMatchObject({ code: "RIDER_OFFLINE" });
  });
  it("the rider page's polling is the heartbeat: it brings a returning rider back without a new sign-in", async () => {
    await riderStartSession(repo, rider); ageRider("test-rider", 600);
    expect((await riderRequests(repo, rider)).rider?.online).toBe(true);
  });
  it("a heartbeat never turns an Offline rider Online", async () => {
    await riderStartSession(repo, rider); await riderSetOnline(repo, rider, false);
    expect((await riderRequests(repo, rider)).rider?.online).toBe(false);
  });
  it("presence TTL is configurable and bounded", async () => {
    const { presenceTtlSec } = await import("@/lib/config");
    expect(presenceTtlSec()).toBe(120);
    vi.stubEnv("BABRIDE_PRESENCE_TTL_SEC", "60"); expect(presenceTtlSec()).toBe(60);
    vi.stubEnv("BABRIDE_PRESENCE_TTL_SEC", "5"); expect(presenceTtlSec()).toBe(120);
  });
});

describe("rider registration uses a default passenger capacity of four", () => {
  it("does not require seat capacity from the applicant", () => {
    expect(riderApplySchema.safeParse({}).success).toBe(true);
    expect(riderApplySchema.safeParse({ vehicleRegistration: "AB-123" }).success).toBe(true);
    expect(riderApplySchema.safeParse({ seatCapacity: 2 }).success).toBe(true);
    expect(riderApplySchema.parse({})).toEqual({});
  });

  it("assigns four passenger seats automatically and leaves capacity unverified", async () => {
    const r = await riderApply(repo, other, { vehicleRegistration: "AB-123" });
    expect(r).toMatchObject({
      approval: "approved",
      online: false,
      vehicle: {
        capacity: 4,
        capacityVerified: false,
        approval: "approved"
      }
    });
    expect((await repo.listRiders()).find((x) => x.userId === other.id)?.vehicle?.capacity).toBe(4);
    expect((await repo.getRider(other.id))?.vehicle?.capacity).toBe(4);
  });

  it("uses four seats for every new rider regardless of client-sent capacity", async () => {
    const r = await riderApply(repo, other, { vehicleRegistration: "AB-123" });
    expect(r.vehicle?.capacity).toBe(4);
  });

  it("newly registered approved riders can go online", async () => {
    await riderApply(repo, other, {});
    const asRider = { ...other, role: "rider" as const };
    expect(await riderStartSession(repo, asRider)).toEqual({ online: true, reason: null });
  });

  it("an administrator can verify the default capacity for group bookings", async () => {
    await riderApply(repo, other, {});
    await adminSetVehicleCapacity(repo, admin, other.id, 4);
    await adminRiderAction(repo, admin, other.id, "approve");
    expect((await repo.getRider(other.id))?.vehicle).toMatchObject({
      capacity: 4,
      capacityVerified: true
    });
  });
});

