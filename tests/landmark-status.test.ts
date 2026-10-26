import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { addLocationSchema, setLocationPositionSchema } from "@/lib/schemas";
import { adminAddLocation, adminSetLocationPosition, adminVerifyLocation, createRide, quote } from "@/lib/service";
import { deriveLocation, isPlaceholderCoords } from "@/lib/loc-derive";
import { admin, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
beforeEach(() => { resetMemoryStore(); setTestBoundary(null); });

describe("a landmark with a real position is never 'not located yet' (root cause: status ignored the saved coordinates)", () => {
  it("derives status from the coordinates: real point + no source label = located (legacy), not a placeholder", () => {
    expect(deriveLocation({ latitude: 6.8912, longitude: 3.7203, is_verified: false, location_source: null })).toEqual({ status: "selected", source: "legacy" });
    expect(deriveLocation({ latitude: 6.8912, longitude: 3.7203, is_verified: true, location_source: "map" })).toEqual({ status: "verified", source: "map" });
    expect(deriveLocation({ latitude: 0, longitude: 0, is_verified: false, location_source: null })).toEqual({ status: "placeholder", source: null });
  });
  it("a 0,0 row can never look verified or located, whatever flags it carries", () => {
    expect(deriveLocation({ latitude: 0, longitude: 0, is_verified: true, location_source: "map" }).status).toBe("placeholder");
    expect(isPlaceholderCoords(0.0004, -0.0004)).toBe(true); expect(isPlaceholderCoords(6.89, 3.72)).toBe(false); expect(isPlaceholderCoords(null, 3)).toBe(true);
  });
});

describe("a saved position is used for booking and pricing straight away", () => {
  it("Winslow Hall without a position can't be booked, and students get a plain message (no admin jargon)", async () => {
    const winslow = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Winslow Hall" }));
    setTestBoundary([[-1, -1], [-1, 1], [1, 1], [1, -1]]);
    let msg = "";
    try { await quote(repo, { locationId: "loc-1" }, winslow.id); } catch (e) { msg = (e as Error).message; }
    expect(msg).toBe("Winslow Hall can't be booked right now. Please choose another place, or try again later.");
    expect(/administrator|configur|position|coordinates/i.test(msg)).toBe(false);
  });
  it("the moment an admin saves its position, the same trip is priced with no restart, cache or repeat configuration", async () => {
    const winslow = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Winslow Hall" }));
    setTestBoundary([[-1, -1], [-1, 1], [1, 1], [1, -1]]);
    await expect(quote(repo, { locationId: "loc-1" }, winslow.id)).rejects.toMatchObject({ code: "LANDMARK_NOT_LOCATED" });
    await adminSetLocationPosition(repo, admin, winslow.id, setLocationPositionSchema.parse({ latitude: 0.2, longitude: 0.2, source: "map" }));
    expect((await quote(repo, { locationId: "loc-1" }, winslow.id)).fareKobo).toBe(20000);
    const ride = await createRide(repo, student, { pickup: { locationId: "loc-1" }, destinationLocationId: winslow.id, passengerCount: 2, paymentMethod: "cash", idempotencyKey: "stat-key-0001" });
    expect(ride).toMatchObject({ fareKobo: 40000, destination: { id: winslow.id, name: "Winslow Hall" } });
  });
  it("a located landmark is selectable as pickup and as destination, without further setup", async () => {
    setTestBoundary([[-1, -1], [-1, 1], [1, 1], [1, -1]]); // strict mode needs a polygon; this test-only square contains the points below
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Emerald Hall", latitude: 0.2, longitude: 0.25, source: "search" }));
    expect((await quote(repo, { locationId: l.id }, "loc-2")).pickup).toMatchObject({ locationId: l.id, label: "Emerald Hall", latitude: 0.2, longitude: 0.25 });
    expect((await quote(repo, { locationId: "loc-2" }, l.id)).destination).toEqual({ id: l.id, name: "Emerald Hall" });
    const listed = (await repo.listLocations()).find((x) => x.id === l.id)!;
    expect(listed.status).toBe("selected"); expect(listed.latitude).toBe(0.2);
    expect((await adminVerifyLocation(repo, admin, l.id)).status).toBe("verified");
  });
  it("never saves fake 0,0 coordinates", async () => {
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    expect(addLocationSchema.safeParse({ name: "Library", latitude: 0, longitude: 0, source: "map" }).success).toBe(false);
    expect(setLocationPositionSchema.safeParse({ latitude: 0, longitude: 0, source: "map" }).success).toBe(false);
    expect(l.status).toBe("placeholder");
  });
});
