import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { addLocationSchema } from "@/lib/schemas";
import { adminAddLocation, createRide, quote } from "@/lib/service";
import { serviceAreaMode } from "@/lib/config";
import { quoteBetweenLandmarks } from "@/lib/fare";
import { admin, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const book = (pickup: object, dest: string, key: string) => ({ pickup, destinationLocationId: dest, paymentMethod: "cash" as const, idempotencyKey: key });
beforeEach(() => resetMemoryStore());
afterEach(() => vi.unstubAllEnvs());

describe("service-area mode", () => {
  it("defaults to the owner's strict rule: a polygon is required", () => {
    expect(serviceAreaMode()).toBe("boundary");
    vi.stubEnv("BABRIDE_SERVICE_AREA", "landmarks"); expect(serviceAreaMode()).toBe("landmarks");
    vi.stubEnv("BABRIDE_SERVICE_AREA", "anything else"); expect(serviceAreaMode()).toBe("boundary");
  });
  it("quoteBetweenLandmarks: ₦200 for two different landmarks, never for the same one", () => {
    expect(quoteBetweenLandmarks("a", "b")).toEqual({ ok: true, fareKobo: 20000, currency: "NGN" });
    expect(quoteBetweenLandmarks("a", "a")).toMatchObject({ ok: false, code: "SAME_LOCATION" });
  });
});

describe("strict mode (default)", () => {
  it("a landmark with no map position cannot be priced, and says why", async () => {
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    await expect(quote(repo, { locationId: "loc-1" }, l.id)).rejects.toMatchObject({ code: "LANDMARK_NOT_LOCATED" });
    await expect(quote(repo, { latitude: 0.1, longitude: 0.1 }, l.id)).rejects.toMatchObject({ code: "LANDMARK_NOT_LOCATED" });
  });
  it("with no polygon, a GPS pickup gets a clear 'choose a landmark' message", async () => {
    setTestBoundary(null);
    await expect(quote(repo, { latitude: 0.1, longitude: 0.1 }, "loc-2")).rejects.toMatchObject({ code: "BOUNDARY_NOT_CONFIGURED", message: expect.stringMatching(/choose a pickup landmark/i) });
  });
});

describe("landmarks mode (opt-in)", () => {
  beforeEach(() => vi.stubEnv("BABRIDE_SERVICE_AREA", "landmarks"));

  it("prices a trip between two landmarks with no polygon and no coordinates", async () => {
    setTestBoundary(null);
    const a = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    const q = await quote(repo, { locationId: a.id }, "loc-2");
    expect(q).toMatchObject({ fareKobo: 20000, pickup: { latitude: null, longitude: null, label: "Library" } });
    const ride = await createRide(repo, student, book({ locationId: a.id }, "loc-2", "area-key-0001"));
    expect(ride).toMatchObject({ fareKobo: 20000, pickup: { latitude: null, longitude: null } });
  });
  it("still refuses the same landmark at both ends and unknown or deactivated landmarks", async () => {
    setTestBoundary(null);
    await expect(quote(repo, { locationId: "loc-1" }, "loc-1")).rejects.toMatchObject({ code: "SAME_LOCATION" });
    await expect(quote(repo, { locationId: "loc-1" }, "nope")).rejects.toMatchObject({ code: "BAD_DESTINATION" });
    await expect(quote(repo, { locationId: "nope" }, "loc-2")).rejects.toMatchObject({ code: "BAD_PICKUP" });
  });
  it("GPS pickups still need a polygon (a raw GPS point could be anywhere)", async () => {
    setTestBoundary(null);
    await expect(quote(repo, { latitude: 6.9, longitude: 3.7 }, "loc-2")).rejects.toMatchObject({ code: "BOUNDARY_NOT_CONFIGURED" });
  });
  it("when a polygon exists and both landmarks are located, geometry wins: outside means refused", async () => {
    // The service refuses to SAVE an out-of-campus landmark, so insert the far one straight into the test repo.
    const far = await repo.addLocation({ name: "Far away", description: "", latitude: 50, longitude: 50, source: "map", pickupAllowed: true, destinationAllowed: true }, "t");
    const near = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Near", latitude: 0.2, longitude: 0.2, source: "map" }));
    await expect(quote(repo, { locationId: far.id }, near.id)).rejects.toMatchObject({ code: "PICKUP_OUT_OF_AREA" });
    expect((await quote(repo, { locationId: near.id }, "loc-2")).fareKobo).toBe(20000);
  });
  it("the fare never depends on distance or passengers", async () => {
    setTestBoundary(null);
    const one = await quote(repo, { locationId: "loc-1" }, "loc-2"); const two = await quote(repo, { locationId: "loc-3" }, "loc-7");
    expect(one.fareKobo).toBe(two.fareKobo);
  });
});
