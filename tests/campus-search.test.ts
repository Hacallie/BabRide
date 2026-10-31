import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getMemoryRepo, resetMemoryStore, setTestBoundary } from "./helpers/memory-repo";
import { addLocationSchema, setLocationPositionSchema } from "@/lib/schemas";
import { adminAddLocation, adminSetLocationPosition } from "@/lib/service";
import { insideCampusScope, searchPlacesDetailed } from "@/lib/geocode";
import { admin } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
const env = { GEOCODER_PROVIDER: "nominatim", GEOCODER_CONTACT: "a@b.co" };
const hit = (lat: string, lon: string, name: string) => ({ lat, lon, display_name: name });
const respond = (rows: object[]) => (async () => new Response(JSON.stringify(rows))) as unknown as typeof fetch;
const SRC = path.resolve(__dirname, "..", "src");
beforeEach(() => resetMemoryStore());

describe("campus-only search results", () => {
  it("with a polygon, only results inside it are kept and the rest are counted as filtered out", async () => {
    const square: [number, number][] = [[0.29, 0.29], [0.29, 0.31], [0.31, 0.31], [0.31, 0.29]];
    const f = respond([hit("0.30", "0.30", "On campus"), hit("0.80", "0.80", "Another town"), hit("0.301", "0.301", "Also on campus")]);
    const r = await searchPlacesDetailed("Emerald Hall", env, f, { boundary: square, anchors: [], maxMeters: 2500 });
    expect(r.candidates.map((c) => c.label)).toEqual(["On campus", "Also on campus"]);
    expect(r.filteredOut).toBe(1);
  });
  it("without a polygon, results must be near a landmark that is already located", async () => {
    const f = respond([hit("0.3003", "0.3003", "Near CAF"), hit("0.50", "0.50", "Far away")]);
    const r = await searchPlacesDetailed("CAF", env, f, { boundary: null, anchors: [{ latitude: 0.3, longitude: 0.3 }], maxMeters: 2500 });
    expect(r.candidates.map((c) => c.label)).toEqual(["Near CAF"]);
    expect(r.filteredOut).toBe(1);
  });
  it("with nothing known yet (new install) nothing is filtered, so the first landmark can still be found", () => {
    expect(insideCampusScope({ latitude: 6.9, longitude: 3.7 }, { boundary: null, anchors: [], maxMeters: 2500 })).toBe(true);
    expect(insideCampusScope({ latitude: 6.9, longitude: 3.7 }, undefined)).toBe(true);
  });
  it("keeps asking until it has enough campus results, rather than stopping at 3 unrelated ones", async () => {
    let n = 0;
    const f = (async () => { n++; return new Response(JSON.stringify(n === 1 ? [hit("0.9", "0.9", "x1"), hit("0.91", "0.91", "x2"), hit("0.92", "0.92", "x3")] : [hit("0.30", "0.30", "Campus")])); }) as unknown as typeof fetch;
    const r = await searchPlacesDetailed("Hall", env, f, { boundary: [[0.29, 0.29], [0.29, 0.31], [0.31, 0.31], [0.31, 0.29]], anchors: [], maxMeters: 2500 });
    expect(r.candidates.map((c) => c.label)).toEqual(["Campus"]); expect(r.filteredOut).toBe(3);
  });
});

describe("a landmark can never be saved outside the campus polygon", () => {
  const square: [number, number][] = [[0.29, 0.29], [0.29, 0.31], [0.31, 0.31], [0.31, 0.29]];
  it("refuses an out-of-campus position when adding or moving, with a clear message", async () => {
    setTestBoundary(square);
    await expect(adminAddLocation(repo, admin, addLocationSchema.parse({ name: "Elsewhere", latitude: 0.8, longitude: 0.8, source: "search" }))).rejects.toMatchObject({ code: "OUTSIDE_CAMPUS", status: 422 });
    const ok = await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "On campus", latitude: 0.3, longitude: 0.3, source: "search" }));
    await expect(adminSetLocationPosition(repo, admin, ok.id, setLocationPositionSchema.parse({ latitude: 0.8, longitude: 0.8, source: "map" }))).rejects.toMatchObject({ code: "OUTSIDE_CAMPUS" });
    expect((await repo.listLocations()).find((l) => l.id === ok.id)).toMatchObject({ latitude: 0.3 }); // unchanged
  });
  it("with no polygon yet there is nothing to check against, so the first landmarks can be saved", async () => {
    setTestBoundary(null);
    expect((await adminAddLocation(repo, admin, addLocationSchema.parse({ name: "First", latitude: 6.9, longitude: 3.7, source: "search" }))).status).toBe("selected");
  });
});

describe("the Search button cannot reload the page (static checks of the real component)", () => {
  const picker = fs.readFileSync(path.join(SRC, "components/admin/LocationPicker.tsx"), "utf8");
  const admin_ = fs.readFileSync(path.join(SRC, "components/admin/LandmarksAdmin.tsx"), "utf8");
  it("the picker contains no <form> at all, so it can never be a nested form that submits its parent", () => {
    expect(/<form[\s>]/.test(picker)).toBe(false);
  });
  it("the Search button is type=\"button\" with a click handler, and Enter in the box is handled without submitting", () => {
    expect(/<button[^>]*type="button"[^>]*onClick=\{\(\) => void search\(\)\}/.test(picker.replace(/\n/g, " "))).toBe(true);
    expect(picker).toContain('e.key === "Enter"'); expect(picker).toContain("e.preventDefault()");
  });
  it("the Add-landmark form hosts the picker, which is exactly why a form inside the picker was a bug", () => {
    expect(/<form onSubmit=\{add\}/.test(admin_)).toBe(true); expect(admin_).toContain("<LocationPicker");
  });
});
