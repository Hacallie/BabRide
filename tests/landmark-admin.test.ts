import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { addLocationSchema, setLocationPositionSchema, updateLocationDetailsSchema } from "@/lib/schemas";
import { adminAddLocation, adminSetLocationPosition, adminUpdateLocationDetails, adminVerifyLocation } from "@/lib/service";
import { admin, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const point = { latitude: 6.8912, longitude: 3.7203, source: "search" as const };
beforeEach(() => { resetMemoryStore(); setTestBoundary(null); }); // polygon rules are tested in campus-search.test.ts

describe("creating a landmark needs only a name (the reported bug)", () => {
  it("accepts a name alone: no pickup point, no GPS, no coordinates", () => {
    const r = addLocationSchema.safeParse({ name: "Library" });
    expect(r.success).toBe(true);
    expect(addLocationSchema.parse({ name: "Library" })).toMatchObject({ name: "Library", description: "", pickupAllowed: true, destinationAllowed: true });
  });
  it("never produces the old 'Choose the pickup point' wording", () => {
    for (const bad of [{}, { name: "A" }, { name: "Library", latitude: 1 }, { name: "Library", source: "map" }, { name: "Library", ...point, latitude: 0, longitude: 0 }]) {
      const r = addLocationSchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) expect(/pickup point|current location/i.test(r.error.issues.map((i) => i.message).join(" "))).toBe(false);
    }
  });
  it("still validates a position when one is given (complete, real, valid range)", () => {
    expect(addLocationSchema.safeParse({ name: "Library", ...point }).success).toBe(true);
    expect(addLocationSchema.safeParse({ name: "Library", latitude: 6.9, source: "map" }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, latitude: 91 }).success).toBe(false);
    expect(addLocationSchema.safeParse({ name: "Library", ...point, latitude: 0, longitude: 0 }).success).toBe(false);
  });
  it("saves a name-only landmark as 'not located yet' (placeholder), never verified, and it can be picked by name", async () => {
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    expect(l).toMatchObject({ name: "Library", status: "placeholder", verified: false, source: null, active: true });
    expect((await repo.listLocations()).some((x) => x.id === l.id)).toBe(true);
  });
});

describe("full landmark workflow: create, edit, locate, verify, public map", () => {
  it("runs in order and protects verified coordinates", async () => {
    const created = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    await expect(adminVerifyLocation(repo, admin, created.id)).rejects.toMatchObject({ code: "NOT_LOCATED" }); // cannot verify what has no position

    const edited = await adminUpdateLocationDetails(repo, admin, created.id, updateLocationDetailsSchema.parse({ name: "Main Library", description: "Near the gate", destinationAllowed: false }));
    expect(edited).toMatchObject({ name: "Main Library", description: "Near the gate", destinationAllowed: false, status: "placeholder" });

    const located = await adminSetLocationPosition(repo, admin, created.id, setLocationPositionSchema.parse(point));
    expect(located).toMatchObject({ status: "selected", latitude: 6.8912, longitude: 3.7203, source: "search" });
    expect(await adminVerifyLocation(repo, admin, created.id)).toMatchObject({ status: "verified", verified: true });

    // Editing details NEVER moves the position or clears verification.
    const renamed = await adminUpdateLocationDetails(repo, admin, created.id, { name: "Library (Main)" });
    expect(renamed).toMatchObject({ name: "Library (Main)", status: "verified", latitude: 6.8912, longitude: 3.7203 });

    // Moving verified coordinates still needs explicit confirmation.
    const other = setLocationPositionSchema.parse({ latitude: 6.9, longitude: 3.73, source: "map" });
    await expect(adminSetLocationPosition(repo, admin, created.id, other)).rejects.toMatchObject({ code: "VERIFIED_LOCATION" });
    expect((await repo.listLocations()).find((x) => x.id === created.id)).toMatchObject({ latitude: 6.8912, status: "verified" });
  });
  it("deactivating hides a landmark from students but keeps it for admins; reactivating restores it", async () => {
    const l = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Library" }));
    await adminUpdateLocationDetails(repo, admin, l.id, { active: false });
    expect((await repo.listLocations()).some((x) => x.id === l.id)).toBe(false);
    expect((await repo.listLocations(true)).find((x) => x.id === l.id)).toMatchObject({ active: false });
    await adminUpdateLocationDetails(repo, admin, l.id, { active: true });
    expect((await repo.listLocations()).some((x) => x.id === l.id)).toBe(true);
  });
  it("only administrators can create or edit; unknown ids are 404", async () => {
    for (const who of [student, rider, null]) {
      await expect(adminAddLocation(repo, who, addLocationSchema.parse({ name: "Library" }))).rejects.toMatchObject({ status: who ? 403 : 401 });
      await expect(adminUpdateLocationDetails(repo, who, "loc-1", { name: "Hacked" })).rejects.toBeTruthy();
    }
    await expect(adminUpdateLocationDetails(repo, admin, "nope", { name: "Zed" })).rejects.toMatchObject({ status: 404 });
  });
  it("rejects empty or invalid detail edits", () => {
    expect(updateLocationDetailsSchema.safeParse({}).success).toBe(false);
    expect(updateLocationDetailsSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateLocationDetailsSchema.safeParse({ active: false }).success).toBe(true);
    // a client cannot smuggle coordinates or a verified flag through the details endpoint
    const parsed = updateLocationDetailsSchema.parse({ name: "Ok name", latitude: 1, longitude: 2, verified: true, is_verified: true });
    expect(Object.keys(parsed)).toEqual(["name"]);
  });
});
