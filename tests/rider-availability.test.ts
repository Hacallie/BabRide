import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { adminRiderAction, createRide, isEffectivelyOnline, isFresh, riderRequests, riderSessionEnd, riderSessionStart, rideAction } from "@/lib/service";
import { riderStaleSeconds } from "@/lib/config";
import { admin, other, pending, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
beforeEach(() => resetMemoryStore());
const book = (key: string) => ({ pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash" as const, idempotencyKey: key });

describe("rider goes online automatically after sign-in", () => {
  it("sets an approved rider online in the database, with a fresh heartbeat", async () => {
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
    expect(await riderSessionStart(repo, rider)).toEqual({ online: true });
    const saved = await repo.getRider("test-rider");
    expect(saved?.online).toBe(true); expect(isFresh(saved!)).toBe(true);
  });
  it("is idempotent: a second tab, a reconnect or a duplicate call changes nothing and fails nothing", async () => {
    await riderSessionStart(repo, rider);
    expect(await riderSessionStart(repo, rider)).toEqual({ online: true });
    expect((await repo.getRider("test-rider"))?.online).toBe(true);
  });
  it("does NOT make a pending, rejected or suspended rider available, and does not block sign-in", async () => {
    expect(await riderSessionStart(repo, pending)).toEqual({ online: false, reason: "NOT_APPROVED" });
    await repo.setRiderApproval("test-rider-pending", "rejected", "test-admin");
    expect(await riderSessionStart(repo, pending)).toEqual({ online: false, reason: "SUSPENDED" });
    await adminRiderAction(repo, admin, "test-rider", "suspend");
    expect(await riderSessionStart(repo, rider)).toEqual({ online: false, reason: "SUSPENDED" });
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
  });
  it("does not make a rider with an incomplete profile (no vehicle) available", async () => {
    repo.removeVehicle("test-rider");
    expect(await riderSessionStart(repo, rider)).toEqual({ online: false, reason: "INCOMPLETE_PROFILE" });
  });
  it("never marks a customer, an admin or an anonymous visitor as a driver", async () => {
    await expect(riderSessionStart(repo, student)).rejects.toMatchObject({ status: 403 });
    await expect(riderSessionStart(repo, admin)).rejects.toMatchObject({ status: 403 });
    await expect(riderSessionStart(repo, null)).rejects.toMatchObject({ status: 401 });
    await expect(riderSessionEnd(repo, student)).rejects.toMatchObject({ status: 403 });
  });
});

describe("rider goes offline appropriately", () => {
  it("sign-out (session end) sets the rider offline, and repeating it is harmless", async () => {
    await riderSessionStart(repo, rider);
    expect(await riderSessionEnd(repo, rider)).toEqual({ online: false });
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
    expect(await riderSessionEnd(repo, rider)).toEqual({ online: false });
  });
  it("suspending a rider takes them offline immediately", async () => {
    await riderSessionStart(repo, rider);
    await adminRiderAction(repo, admin, "test-rider", "suspend");
    expect((await repo.getRider("test-rider"))?.online).toBe(false);
  });
  it("a lapsed heartbeat (closed tab, dead phone, expired session) counts as offline by itself", async () => {
    await riderSessionStart(repo, rider);
    await createRide(repo, student, book("avail-key-0001"));
    expect((await riderRequests(repo, rider)).requests).toHaveLength(1);
    repo.ageHeartbeat("test-rider", riderStaleSeconds() + 30);
    const feed = await riderRequests(repo, rider);
    expect(feed.rider?.online).toBe(false); expect(feed.requests).toEqual([]);
    await expect(rideAction(repo, rider, (await repo.listSearching())[0]!.id, "accept")).rejects.toMatchObject({ code: "RIDER_OFFLINE" });
    // polling must not silently revive a rider who already lapsed; signing in again does
    expect((await riderRequests(repo, rider)).rider?.online).toBe(false);
    await riderSessionStart(repo, rider);
    expect((await riderRequests(repo, rider)).rider?.online).toBe(true);
  });
  it("each poll is a heartbeat that keeps a live rider online", async () => {
    await riderSessionStart(repo, rider);
    repo.ageHeartbeat("test-rider", riderStaleSeconds() - 10);
    await riderRequests(repo, rider);
    expect(isFresh((await repo.getRider("test-rider"))!)).toBe(true);
    expect(((Date.now() - new Date((await repo.getRider("test-rider"))!.lastSeenAt!).getTime()) / 1000)).toBeLessThan(5);
  });
  it("isEffectivelyOnline needs both the flag and a fresh heartbeat; the window is configurable", async () => {
    const base = { userId: "x", name: "x", approval: "approved" as const, vehicle: null };
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(isEffectivelyOnline({ ...base, online: true, lastSeenAt: "2026-01-01T11:59:30Z" }, now)).toBe(true);
    expect(isEffectivelyOnline({ ...base, online: true, lastSeenAt: "2026-01-01T11:50:00Z" }, now)).toBe(false);
    expect(isEffectivelyOnline({ ...base, online: false, lastSeenAt: "2026-01-01T11:59:59Z" }, now)).toBe(false);
    expect(isEffectivelyOnline({ ...base, online: true, lastSeenAt: null }, now)).toBe(false);
    vi.stubEnv("BABRIDE_RIDER_STALE_SECONDS", "600");
    expect(isEffectivelyOnline({ ...base, online: true, lastSeenAt: "2026-01-01T11:55:00Z" }, now)).toBe(true);
    vi.unstubAllEnvs();
  });
  it("other users are never affected by a rider's session calls", async () => {
    await riderSessionStart(repo, rider);
    expect((await repo.getRider("test-rider-pending"))?.online).toBe(false);
    expect(await repo.getRider(other.id)).toBeNull();
  });
});
