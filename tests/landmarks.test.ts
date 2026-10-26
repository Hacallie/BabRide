import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { addLocationSchema, geocodeQuerySchema, setLocationPositionSchema, verifyLocationSchema } from "@/lib/schemas";
import { adminAddLocation, adminSetLocationPosition, adminVerifyLocation, createRide } from "@/lib/service";
import { geocoderConfig, parseNominatim, searchPlaces } from "@/lib/geocode";
import { nudge, validPoint } from "@/lib/geo-pick";
import { admin, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const point = { latitude: 6.8912, longitude: 3.7203, source: "search" as const };
beforeEach(() => resetMemoryStore());

describe("landmark input", () => {
  it("needs only a name and a real point; description is optional", () => {
    const r = addLocationSchema.parse({ name: "  Library  ", ...point });
    expect(r).toMatchObject({ name: "Library", description: "", pickupAllowed: true, destinationAllowed: true });
  });
  it("rejects a missing name, missing/invalid coordinates and the (0,0) placeholder", () => {
    expect(addLocationSchema.safeParse({ ...point }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "A", ...point }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", source: "map" }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, latitude: 91 }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, longitude: -181 }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, latitude: 0, longitude: 0 }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, latitude: "6.8" }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, source: "typed" }).success).toBe(false);
  });
  it("strips a client-sent verified flag", () => {
    const r = addLocationSchema.parse({ name: "Library", ...point, verified: true, is_verified: true });
    expect("verified" in r || "is_verified" in r).toBe(false);
  });
  it("validates position, verify and search input", () => {
    expect(setLocationPositionSchema.safeParse({ ...point, latitude: 0, longitude: 0 }).success).toBe(false);
    expect(verifyLocationSchema.safeParse({}).success).toBe(false);
    expect(verifyLocationSchema.safeParse({ confirm: false }).success).toBe(false);
    expect(verifyLocationSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(geocodeQuerySchema.safeParse({ q: "ab" }).success).toBe(false);
  });
});

describe("landmark creation and verification rules", () => {
  // These tests are about landmark rules, not the polygon: clear the test polygon so real-looking points are accepted.
  // (The campus-only rule has its own tests in campus-search.test.ts.)
  beforeEach(() => setTestBoundary(null));
  it("only an administrator can add, move or verify", async () => {
    const input = addLocationSchema.parse({ name: "Library", ...point });
    for (const who of [student, rider, null]) {
      await expect(adminAddLocation(repo, who, input)).rejects.toMatchObject({ status: who ? 403 : 401 });
      await expect(adminSetLocationPosition(repo, who, "loc-1", setLocationPositionSchema.parse(point))).rejects.toBeTruthy();
      await expect(adminVerifyLocation(repo, who, "loc-1")).rejects.toBeTruthy();
    }
  });
  it("a new landmark is 'selected', never ground verified", async () => {
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library", ...point, verified: true }));
    expect(l).toMatchObject({ status: "selected", verified: false, source: "search" });
  });
  it("cannot verify a placeholder, then verifies after it is located", async () => {
    await expect(adminVerifyLocation(repo, admin, "loc-1")).rejects.toMatchObject({ code: "NOT_LOCATED" });
    const moved = await adminSetLocationPosition(repo, admin, "loc-1", setLocationPositionSchema.parse(point));
    expect(moved).toMatchObject({ status: "selected", verified: false });
    expect(await adminVerifyLocation(repo, admin, "loc-1")).toMatchObject({ status: "verified", verified: true });
  });
  it("never replaces verified coordinates without explicit confirmation", async () => {
    await adminSetLocationPosition(repo, admin, "loc-1", setLocationPositionSchema.parse(point));
    await adminVerifyLocation(repo, admin, "loc-1");
    const other = { latitude: 6.9, longitude: 3.73, source: "search" as const };
    await expect(adminSetLocationPosition(repo, admin, "loc-1", setLocationPositionSchema.parse(other))).rejects.toMatchObject({ code: "VERIFIED_LOCATION" });
    expect((await repo.listLocations(true)).find((l) => l.id === "loc-1")).toMatchObject({ latitude: 6.8912, status: "verified" });
    const after = await adminSetLocationPosition(repo, admin, "loc-1", setLocationPositionSchema.parse({ ...other, confirmReplaceVerified: true }));
    expect(after).toMatchObject({ latitude: 6.9, status: "selected", verified: false });
  });
  it("404 for an unknown landmark", async () => {
    await expect(adminSetLocationPosition(repo, admin, "nope", setLocationPositionSchema.parse(point))).rejects.toMatchObject({ status: 404 });
  });
});

describe("landmark selection by name", () => {
  it("a student books by landmark id; the fare comes from the server's saved coordinates", async () => {
    const ride = await createRide(repo, student, { pickup: { latitude: 5, longitude: 5, locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash", idempotencyKey: "landmark-key-1" });
    expect(ride).toMatchObject({ fareKobo: 20000, pickup: { label: "CAF" }, destination: { name: "BUSA" } });
  });
});

describe("geocoder boundary", () => {
  it("is off unless explicitly enabled with a contact and an https base URL", () => {
    expect(geocoderConfig({})).toEqual({ provider: "none" });
    expect(geocoderConfig({ GEOCODER_PROVIDER: "nominatim" })).toEqual({ provider: "none" });
    expect(geocoderConfig({ GEOCODER_PROVIDER: "nominatim", GEOCODER_CONTACT: "a@b.co", GEOCODER_BASE_URL: "http://x.test" })).toEqual({ provider: "none" });
    expect(geocoderConfig({ GEOCODER_PROVIDER: "nominatim", GEOCODER_CONTACT: "a@b.co" })).toMatchObject({ provider: "nominatim" });
  });
  it("search fails clearly when not configured, and never calls the network", async () => {
    let called = false;
    await expect(searchPlaces("library", {}, (async () => { called = true; return new Response("[]"); }) as typeof fetch)).rejects.toMatchObject({ status: 503, code: "GEOCODER_NOT_CONFIGURED" });
    expect(called).toBe(false);
  });
  it("parses provider results defensively", () => {
    const out = parseNominatim([{ lat: "6.89", lon: "3.72", display_name: "Place" }, { lat: "x", lon: "1", display_name: "Bad" }, { lat: "95", lon: "1", display_name: "Out" }, null]);
    expect(out).toEqual([{ label: "Place", latitude: 6.89, longitude: 3.72 }]);
    expect(parseNominatim({ not: "an array" })).toEqual([]);
  });
  it("maps a provider failure to a friendly 502", async () => {
    const env = { GEOCODER_PROVIDER: "nominatim", GEOCODER_CONTACT: "a@b.co" };
    await expect(searchPlaces("library", env, (async () => new Response("no", { status: 500 })) as typeof fetch)).rejects.toMatchObject({ status: 502 });
  });
});

describe("picker helpers", () => {
  it("nudges by about 10 m and rejects placeholder points", () => {
    const n = nudge(6.89, 3.72, "north", 10);
    expect(n.latitude).toBeGreaterThan(6.89); expect(n.latitude - 6.89).toBeLessThan(0.0002); expect(n.longitude).toBe(3.72);
    expect(validPoint(0, 0)).toBe(false); expect(validPoint(6.89, 3.72)).toBe(true); expect(validPoint(NaN, 3)).toBe(false);
  });
});