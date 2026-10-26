import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { nearestBodySchema, addLocationSchema } from "@/lib/schemas";
import { nearestLandmarks } from "@/lib/nearest";
import { adminAddLocation, adminVerifyLocation, nearestLandmark } from "@/lib/service";
import { nearestMaxMeters } from "@/lib/config";
import { distanceMeters } from "@/lib/map-plot";
import { admin } from "./helpers/ride-fixtures";
import type { Loc } from "@/lib/types";

const repo = getMemoryRepo();
// TEST-ONLY positions near (0.30, 0.30). Not Babcock. 0.001 degrees is roughly 111 m.
const at = (name: string, lat: number, lng: number, status: Loc["status"] = "selected"): Loc => ({ id: `id-${name}`, name, description: "", latitude: lat, longitude: lng, verified: status === "verified", status, source: status === "placeholder" ? null : "map", pickupAllowed: true, destinationAllowed: true, active: true });
const LOCS = [at("Emerald Hall", 0.3000, 0.3000), at("CAF", 0.3000, 0.3030, "verified"), at("Winslow Hall", 0, 0, "placeholder"), at("Amphitheatre", 0.3030, 0.3000)];
beforeEach(() => { resetMemoryStore(); setTestBoundary(null); });
afterEach(() => vi.unstubAllEnvs());

describe("nearest landmark (pure)", () => {
  it("picks the nearest landmark, not a hard-coded one", () => {
    expect(nearestLandmarks({ latitude: 0.3001, longitude: 0.3001 }, LOCS, 250).match?.name).toBe("Emerald Hall");
    expect(nearestLandmarks({ latitude: 0.3001, longitude: 0.3029 }, LOCS, 250).match?.name).toBe("CAF");
    expect(nearestLandmarks({ latitude: 0.3029, longitude: 0.3001 }, LOCS, 250).match?.name).toBe("Amphitheatre");
  });
  it("uses a real geographic distance and reports it", () => {
    const r = nearestLandmarks({ latitude: 0.3010, longitude: 0.3000 }, LOCS, 250);
    expect(r.match?.distanceMeters).toBe(Math.round(distanceMeters({ lat: 0.301, lng: 0.3 }, { lat: 0.3, lng: 0.3 })));
    expect(r.match?.distanceMeters).toBeGreaterThan(105); expect(r.match?.distanceMeters).toBeLessThan(118);
  });
  it("never matches a landmark that has no position ('Not located yet'), even if the user is standing at 0,0", () => {
    expect(nearestLandmarks({ latitude: 0.0001, longitude: 0.0001 }, LOCS, 250).match).toBeNull();
    expect(nearestLandmarks({ latitude: 0.3, longitude: 0.3 }, [at("Winslow Hall", 0, 0, "placeholder")], 250).reason).toBe("no_located_landmarks");
  });
  it("respects the maximum distance: too far from everything means no match, but the nearest options are offered", () => {
    const r = nearestLandmarks({ latitude: 0.4, longitude: 0.4 }, LOCS, 250);
    expect(r.match).toBeNull(); expect(r.reason).toBe("too_far");
    expect(r.nearby).toHaveLength(3); expect(r.nearby[0]!.distanceMeters).toBeLessThanOrEqual(r.nearby[1]!.distanceMeters);
  });
  it("ignores deactivated landmarks and prefers a ground-verified one when two are equally close", () => {
    expect(nearestLandmarks({ latitude: 0.3, longitude: 0.3 }, [{ ...at("Emerald Hall", 0.3, 0.3), active: false }, at("CAF", 0.3, 0.3029, "verified")], 5000).match?.name).toBe("CAF");
    const tie = nearestLandmarks({ latitude: 0.3, longitude: 0.3 }, [at("A", 0.3, 0.3), at("B", 0.3, 0.3, "verified")], 250);
    expect(tie.match?.name).toBe("B");
  });
  it("the maximum distance is configurable (default 250 m)", () => {
    expect(nearestMaxMeters()).toBe(250);
    vi.stubEnv("BABRIDE_NEAREST_MAX_METERS", "60"); expect(nearestMaxMeters()).toBe(60);
    vi.stubEnv("BABRIDE_NEAREST_MAX_METERS", "5"); expect(nearestMaxMeters()).toBe(250);
  });
});

describe("nearest landmark through the service (what 'Use my location' calls)", () => {
  async function setup() {
    const em = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Emerald Hall", latitude: 0.3, longitude: 0.3, source: "map" }));
    const caf = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "CAF", latitude: 0.3, longitude: 0.303, source: "map" }));
    await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Winslow Hall" })); // no position
    await adminVerifyLocation(repo, admin, caf.id);
    return { em, caf };
  }
  it("a user near Emerald Hall gets Emerald Hall's id and name; near CAF gets CAF", async () => {
    const { em, caf } = await setup();
    expect(await nearestLandmark(repo, { latitude: 0.3002, longitude: 0.3001 })).toMatchObject({ reason: "ok", match: { id: em.id, name: "Emerald Hall" } });
    expect(await nearestLandmark(repo, { latitude: 0.3001, longitude: 0.3029 })).toMatchObject({ match: { id: caf.id, name: "CAF", verified: true } });
  });
  it("returns no coordinates at all (ids, names and distances only)", async () => {
    await setup();
    const r = await nearestLandmark(repo, { latitude: 0.3002, longitude: 0.3001 });
    expect(JSON.stringify(r)).not.toMatch(/latitude|longitude/);
  });
  it("far from every landmark: no match, nearest options instead; outside the campus polygon: says so", async () => {
    await setup();
    expect(await nearestLandmark(repo, { latitude: 0.4, longitude: 0.4 })).toMatchObject({ match: null, reason: "too_far" });
    setTestBoundary([[0.29, 0.29], [0.29, 0.31], [0.31, 0.31], [0.31, 0.29]]);
    expect(await nearestLandmark(repo, { latitude: 0.5, longitude: 0.5 })).toMatchObject({ match: null, reason: "outside_campus", nearby: [] });
    expect((await nearestLandmark(repo, { latitude: 0.3002, longitude: 0.3001 })).match?.name).toBe("Emerald Hall");
  });
  it("the request is validated: bad ranges and the 0,0 placeholder are refused", () => {
    expect(nearestBodySchema.safeParse({ latitude: 0.3, longitude: 0.3 }).success).toBe(true);
    for (const bad of [{ latitude: 91, longitude: 0.3 }, { latitude: 0, longitude: 0 }, { latitude: "x", longitude: 1 }, { latitude: 0.3 }]) expect(nearestBodySchema.safeParse(bad).success).toBe(false);
  });
});
