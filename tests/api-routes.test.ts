// Calls the REAL route handlers. Only the repository and the sign-in lookup are replaced by test doubles.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { admin, rider, student } from "./helpers/ride-fixtures";
import { getMemoryRepo, resetMemoryStore, setTestLocationPosition, TEST_ORIGIN } from "./helpers/memory-repo";

vi.mock("@/lib/repo", async () => { const m = await import("./helpers/memory-repo"); return { getRepo: async () => m.getMemoryRepo() }; });
vi.mock("@/lib/session", async () => {
  const f = await import("./helpers/ride-fixtures");
  const who: Record<string, unknown> = { student: f.student, rider: f.rider, admin: f.admin };
  return { getActor: async (req: Request) => who[req.headers.get("x-test-actor") ?? ""] ?? null };
});

import * as positionRoute from "@/app/api/v1/admin/locations/[id]/[action]/route";
import * as adminLocations from "@/app/api/v1/admin/locations/route";
import * as landmarksRoute from "@/app/api/v1/campus/landmarks/route";
import * as quoteRoute from "@/app/api/v1/fares/quote/route";
import * as ridesRoute from "@/app/api/v1/rides/route";
import * as nearestRoute from "@/app/api/v1/campus/nearest/route";
import * as searchRoute from "@/app/api/v1/campus/search/route";
import * as sessionStart from "@/app/api/v1/rider/session/start/route";
import * as sessionEnd from "@/app/api/v1/rider/session/end/route";
import * as applyRoute from "@/app/api/v1/rider/apply/route";
import * as dashRoute from "@/app/api/v1/admin/dashboard/route";
import * as ridersRoute from "@/app/api/v1/admin/riders/route";
import * as adminRidesRoute from "@/app/api/v1/admin/rides/route";
import * as geocodeRoute from "@/app/api/v1/admin/geocode/route";
import * as capacityRoute from "@/app/api/v1/admin/riders/[id]/[action]/route";

const req = (url: string, who?: string, init: { method?: string; body?: unknown } = {}) =>
  new Request(`http://t.test${url}`, { method: init.method ?? "GET", headers: { "content-type": "application/json", ...(who ? { "x-test-actor": who } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
const call = async (h: (r: Request, c: { params: Record<string, string> }) => Promise<Response>, r: Request, params: Record<string, string> = {}) => { const res = await h(r, { params }); return { status: res.status, json: (await res.json()) as Record<string, any> }; };

const WINSLOW = "loc-7", EMERALD = "loc-6";
const spot = { latitude: TEST_ORIGIN.latitude + 0.0305, longitude: TEST_ORIGIN.longitude + 0.0305, source: "map" };
beforeEach(() => resetMemoryStore());

describe("the reported bug: Winslow Hall has no map position", () => {
  beforeEach(() => setTestLocationPosition(WINSLOW, 0, 0, "placeholder")); // exactly the broken state

  it("an unlocated landmark gives ordinary users a plain message, with no 'administrator needs to set its location' wording", async () => {
    const r = await call(quoteRoute.GET, req(`/api/v1/fares/quote?locationId=loc-1&destinationLocationId=${WINSLOW}`, "student"));
    expect(r.status).toBe(422); expect(r.json.error.code).toBe("LANDMARK_NOT_LOCATED");
    expect(r.json.error.message).toMatch(/can't be booked right now/); expect(r.json.error.message).not.toMatch(/administrator|map position|configured/i);
  });
  it("the public list reports it as not located, and the admin worklist includes it", async () => {
    const list = await call(landmarksRoute.GET, req("/api/v1/campus/landmarks"));
    expect(list.json.landmarks.find((l: any) => l.id === WINSLOW)).toMatchObject({ located: false, status: "placeholder" });
    const all = await call(adminLocations.GET, req("/api/v1/admin/locations", "admin"));
    expect(all.json.locations.find((l: any) => l.id === WINSLOW).status).toBe("placeholder");
  });
  it("ROOT CAUSE: POST /admin/locations/:id/position now exists (it used to be a 405) and persists real coordinates", async () => {
    expect(typeof positionRoute.POST).toBe("function"); // the file used to export only PATCH
    const saved = await call(positionRoute.POST, req(`/api/v1/admin/locations/${WINSLOW}/position`, "admin", { method: "POST", body: spot }), { id: WINSLOW, action: "position" });
    expect(saved.status).toBe(200);
    expect(saved.json.location).toMatchObject({ id: WINSLOW, status: "selected", latitude: spot.latitude, longitude: spot.longitude, verified: false });
    // persisted: a fresh read from the repository has the coordinates
    expect((await getMemoryRepo().listLocations(true)).find((l) => l.id === WINSLOW)).toMatchObject({ latitude: spot.latitude, longitude: spot.longitude });
  });
  it("after the admin saves it, the public booking interface and the pricing service use it immediately", async () => {
    await call(positionRoute.POST, req(`/api/v1/admin/locations/${WINSLOW}/position`, "admin", { method: "POST", body: spot }), { id: WINSLOW, action: "position" });
    const list = await call(landmarksRoute.GET, req("/api/v1/campus/landmarks"));
    expect(list.json.landmarks.find((l: any) => l.id === WINSLOW)).toMatchObject({ located: true, status: "selected" }); // never "not located yet"
    const q = await call(quoteRoute.GET, req(`/api/v1/fares/quote?locationId=loc-1&destinationLocationId=${WINSLOW}&passengerCount=2`, "student"));
    expect(q.status).toBe(200); expect(q.json).toMatchObject({ fareKobo: 40000, farePerPassengerKobo: 20000, passengerCount: 2, destination: { name: "Winslow Hall" } });
    const booked = await call(ridesRoute.POST, req("/api/v1/rides", "student", { method: "POST", body: { pickup: { locationId: "loc-1" }, destinationLocationId: WINSLOW, passengerCount: 2, paymentMethod: "cash", idempotencyKey: "winslow-key-001", fareKobo: 1 } }));
    expect(booked.status).toBe(201); expect(booked.json.ride).toMatchObject({ fareKobo: 40000, passengerCount: 2, destination: { name: "Winslow Hall" } });
  });
  it("it can be picked as a pickup too, without the admin configuring it again", async () => {
    await call(positionRoute.POST, req(`/api/v1/admin/locations/${WINSLOW}/position`, "admin", { method: "POST", body: spot }), { id: WINSLOW, action: "position" });
    const q = await call(quoteRoute.GET, req(`/api/v1/fares/quote?locationId=${WINSLOW}&destinationLocationId=loc-1`, "student"));
    expect(q.status).toBe(200); expect(q.json.pickup).toMatchObject({ locationId: WINSLOW, latitude: spot.latitude });
  });
  it("(0,0) is never saved as a position; points outside the campus are refused; verify works only after locating", async () => {
    const zero = await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: { latitude: 0, longitude: 0, source: "map" } }), { id: WINSLOW, action: "position" });
    expect(zero.status).toBe(400);
    const far = await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: { latitude: 6.89, longitude: 3.72, source: "map" } }), { id: WINSLOW, action: "position" });
    expect(far.status).toBe(422); expect(far.json.error.code).toBe("OUTSIDE_CAMPUS");
    const early = await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: { confirm: true } }), { id: WINSLOW, action: "verify" });
    expect(early.status).toBe(409);
    await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: spot }), { id: WINSLOW, action: "position" });
    const ok = await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: { confirm: true } }), { id: WINSLOW, action: "verify" });
    expect(ok.json.location).toMatchObject({ status: "verified", verified: true });
  });
  it("only administrators may save positions; unknown actions are 404", async () => {
    for (const who of [undefined, "student", "rider"]) {
      const r = await call(positionRoute.POST, req("/x", who, { method: "POST", body: spot }), { id: WINSLOW, action: "position" });
      expect(r.status).toBe(who ? 403 : 401);
    }
    expect((await call(positionRoute.POST, req("/x", "admin", { method: "POST", body: {} }), { id: WINSLOW, action: "bogus" })).status).toBe(404);
  });
});

describe("the legacy seed placeholders (0, 0.000n) are 'needs location', and a located landmark is never reported as unlocated", () => {
  it("both are decided by the coordinates", async () => {
    setTestLocationPosition("loc-7", 0, 0.0007, "placeholder"); // how seed.sql stored Winslow Hall
    setTestLocationPosition("loc-6", TEST_ORIGIN.latitude + 0.02, TEST_ORIGIN.longitude + 0.02, "selected");
    const list = (await call(landmarksRoute.GET, req("/api/v1/campus/landmarks"))).json.landmarks as any[];
    expect(list.find((l) => l.id === "loc-7").located).toBe(false);
    expect(list.find((l) => l.id === "loc-6").located).toBe(true);
  });
});

describe("fare quote endpoint", () => {
  it("1, 2, 3 and 4 passengers: â‚¦200, â‚¦400, â‚¦600, â‚¦800", async () => {
    const totals: number[] = [];
    for (const n of [1, 2, 3, 4]) totals.push((await call(quoteRoute.GET, req(`/api/v1/fares/quote?locationId=loc-1&destinationLocationId=loc-2&passengerCount=${n}`, "student"))).json.fareKobo);
    expect(totals).toEqual([20000, 40000, 60000, 80000]);
  });
  it("rejects 0, negative, fractional and unsupported passenger counts", async () => {
    for (const n of ["0", "-1", "2.5", "5", "abc"]) expect((await call(quoteRoute.GET, req(`/api/v1/fares/quote?locationId=loc-1&destinationLocationId=loc-2&passengerCount=${n}`, "student"))).status, n).toBeGreaterThanOrEqual(400);
  });
});

describe("booking rejects more passengers than any keke seats (before anything is created)", () => {
  it("explains why", async () => {
    // the fixture rider seats 3
    const r = await call(ridesRoute.POST, req("/api/v1/rides", "student", { method: "POST", body: { pickup: { locationId: "loc-1" }, destinationLocationId: "loc-2", passengerCount: 4, paymentMethod: "cash", idempotencyKey: "toobig-key-0001" } }));
    expect(r.status).toBe(409); expect(r.json.error.code).toBe("OVER_CAPACITY"); expect(r.json.error.message).toMatch(/seats 3/);
    expect(await getMemoryRepo().listAllRides(5)).toHaveLength(0);
  });
});

describe("'Use my location' picks the nearest campus landmark", () => {
  const near = (id: string, dLat = 0, dLng = 0) => { const l = getMemoryRepo(); void l; const c = loc(id); return `latitude=${c.latitude + dLat}&longitude=${c.longitude + dLng}`; };
  const loc = (id: string) => { const idx = Number(id.split("-")[1]) - 1; return { latitude: TEST_ORIGIN.latitude + 0.001 * idx, longitude: TEST_ORIGIN.longitude + 0.001 * idx }; };

  it("a user standing near Emerald Hall is assigned Emerald Hall, with its id, name and coordinates", async () => {
    const r = await call(nearestRoute.GET, req(`/api/v1/campus/nearest?${near(EMERALD, 0.0002, 0.0001)}`));
    expect(r.json.status).toBe("matched");
    expect(r.json.match).toMatchObject({ id: EMERALD, name: "Emerald Hall", latitude: loc(EMERALD).latitude, longitude: loc(EMERALD).longitude });
    expect(r.json.match.distanceMeters).toBeLessThan(50);
  });
  it("it is not hardcoded: every landmark is the answer when the user is next to it", async () => {
    for (const id of ["loc-1", "loc-2", "loc-3", "loc-4", "loc-5", "loc-6", "loc-7"]) {
      const r = await call(nearestRoute.GET, req(`/api/v1/campus/nearest?${near(id, 0.00005, 0.00005)}`));
      expect(r.json.match.id, id).toBe(id);
    }
  });
  it("too far from every landmark: no distant landmark is assigned, the nearest options are offered instead", async () => {
    const r = await call(nearestRoute.GET, req(`/api/v1/campus/nearest?latitude=${TEST_ORIGIN.latitude + 0.05}&longitude=${TEST_ORIGIN.longitude + 0.05}`));
    expect(r.json.status).toBe("too_far"); expect(r.json.match).toBeNull(); expect(r.json.nearby.length).toBeGreaterThan(0); expect(r.json.maxMeters).toBe(200);
  });
  it("outside the campus boundary: nothing is assigned", async () => {
    expect((await call(nearestRoute.GET, req("/api/v1/campus/nearest?latitude=6.89&longitude=3.72"))).json).toMatchObject({ status: "outside_campus", match: null });
  });
  it("the matching distance is configurable", async () => {
    vi.stubEnv("BABRIDE_NEAREST_MAX_METERS", "1000");
    const r = await call(nearestRoute.GET, req(`/api/v1/campus/nearest?latitude=${TEST_ORIGIN.latitude + 0.0105}&longitude=${TEST_ORIGIN.longitude + 0.0105}`));
    expect(r.json.maxMeters).toBe(1000); vi.unstubAllEnvs();
  });
  it("ignores unlocated, inactive and non-pickup landmarks, and rejects invalid coordinates", async () => {
    setTestLocationPosition("loc-6", 0, 0, "placeholder"); // Emerald Hall loses its position
    const r = await call(nearestRoute.GET, req(`/api/v1/campus/nearest?${near("loc-6", 0.00001, 0.00001)}`));
    expect(r.json.match?.id).not.toBe(EMERALD);
    for (const q of ["latitude=abc&longitude=1", "latitude=95&longitude=1", "longitude=1"]) expect((await call(nearestRoute.GET, req(`/api/v1/campus/nearest?${q}`))).status, q).toBe(400);
  });
});

describe("campus search returns only campus landmarks", () => {
  it("finds landmarks by name and returns coordinates; an unknown place returns nothing, not an off-campus result", async () => {
    const hit = await call(searchRoute.GET, req("/api/v1/campus/search?q=emerald"));
    expect(hit.json.results[0]).toMatchObject({ id: EMERALD, name: "Emerald Hall", located: true });
    expect((await call(searchRoute.GET, req("/api/v1/campus/search?q=lagos%20airport"))).json.results).toEqual([]);
    expect((await call(searchRoute.GET, req("/api/v1/campus/search?q=a"))).status).toBe(400);
  });
  it("honours pickup/destination rules and hides coordinates of unlocated landmarks", async () => {
    setTestLocationPosition("loc-3", 0, 0, "placeholder");
    const r = await call(searchRoute.GET, req("/api/v1/campus/search?q=big%20meal&purpose=pickup"));
    expect(r.json.results[0]).toMatchObject({ name: "Big Meal", located: false, latitude: null, longitude: null });
  });
});

describe("rider session endpoints", () => {
  it("start puts an approved rider online; customers get 403, anonymous 401; end puts them offline", async () => {
    expect((await call(sessionStart.POST, req("/api/v1/rider/session/start", "rider", { method: "POST" }))).json).toEqual({ online: true, reason: null });
    expect((await getMemoryRepo().getRider("test-rider"))?.online).toBe(true);
    expect((await call(sessionStart.POST, req("/x", "student", { method: "POST" }))).status).toBe(403);
    expect((await call(sessionStart.POST, req("/x", undefined, { method: "POST" }))).status).toBe(401);
    expect((await call(sessionEnd.POST, req("/x", "rider", { method: "POST" }))).json).toEqual({ online: false });
    expect((await getMemoryRepo().getRider("test-rider"))?.online).toBe(false);
  });
  it("rider registration uses the default four passenger seats without asking the rider", async () => {
    const result = await call(applyRoute.POST, req("/x", "student", { method: "POST", body: {} }));
    expect(result.status).toBe(201);
    expect(result.json.rider.vehicle.capacity).toBe(4);
    expect(result.json.rider.vehicle.capacityVerified).toBe(false);
  });
});

describe("role-based protection happens on the server, not just in the UI", () => {
  const adminOnly: [string, (r: Request, c: { params: Record<string, string> }) => Promise<Response>, string, Record<string, string>, unknown?][] = [
    ["dashboard", dashRoute.GET as never, "GET", {}], ["riders", ridersRoute.GET as never, "GET", {}], ["rides", adminRidesRoute.GET as never, "GET", {}],
    ["locations", adminLocations.GET as never, "GET", {}], ["add location", adminLocations.POST as never, "POST", {}, { name: "Library" }],
    ["geocode", geocodeRoute.GET as never, "GET", {}], ["position", positionRoute.POST as never, "POST", { id: "loc-1", action: "position" }, spot],
    ["details", positionRoute.PATCH as never, "PATCH", { id: "loc-1" }, { name: "Renamed" }],
    ["rider capacity", capacityRoute.POST as never, "POST", { id: "test-rider", action: "capacity" }, { capacity: 3 }],
    ["rider approve", capacityRoute.POST as never, "POST", { id: "test-rider", action: "approve" }, {}],
  ];
  for (const [name, h, method, params, body] of adminOnly) {
    it(`admin route "${name}": anonymous 401, student 403, rider 403`, async () => {
      expect((await call(h, req("/x", undefined, { method, body }), params)).status).toBe(401);
      expect((await call(h, req("/x", "student", { method, body }), params)).status).toBe(403);
      expect((await call(h, req("/x", "rider", { method, body }), params)).status).toBe(403);
    });
  }
  it("admin pages' data is available to administrators", async () => {
    expect((await call(dashRoute.GET as never, req("/x", "admin"))).status).toBe(200);
  });
  void admin; void rider; void student;
});

