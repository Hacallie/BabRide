import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, project } from "@/lib/map-plot";
import { geocoderConfig, parseViewbox, searchPlaces } from "@/lib/geocode";

describe("campus map plotting", () => {
  it("measures distance between two real-looking points (about 111 m per 0.001 degree of latitude)", () => {
    const m = distanceMeters({ lat: 6.89, lng: 3.72 }, { lat: 6.891, lng: 3.72 });
    expect(m).toBeGreaterThan(105); expect(m).toBeLessThan(118);
  });
  it("formats short and long distances", () => { expect(formatDistance(432)).toBe("430 m"); expect(formatDistance(1530)).toBe("1.5 km"); });
  it("fits every point inside the drawing area, keeps north up and handles a lone point", () => {
    const placed = project([{ id: "a", lat: 6.89, lng: 3.72 }, { id: "b", lat: 6.895, lng: 3.726 }], 320, 200);
    for (const p of placed) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(320); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(200); }
    expect(placed[1]!.y).toBeLessThan(placed[0]!.y); // b is further north, so higher on screen
    const solo = project([{ id: "z", lat: 6.9, lng: 3.7 }], 320, 200);
    expect(solo[0]!.x).toBe(160); expect(solo[0]!.y).toBe(100);
    expect(project([], 320, 200)).toEqual([]);
  });
});

describe("campus-first place search", () => {
  const env = { GEOCODER_PROVIDER: "nominatim", GEOCODER_CONTACT: "a@b.co" };
  const hit = (lat: string, lon: string, name: string) => ({ lat, lon, display_name: name });
  it("validates the optional viewbox and never guesses one", () => {
    expect(parseViewbox(undefined)).toBeNull();
    expect(parseViewbox("3.70,6.88,3.74,6.90")).toBe("3.7,6.88,3.74,6.9");
    for (const bad of ["1,2,3", "a,b,c,d", "3.7,6.9,3.7,6.8", "999,1,2,3"]) expect(parseViewbox(bad)).toBeNull();
    expect(geocoderConfig(env)).toMatchObject({ provider: "nominatim", viewbox: null });
    expect(geocoderConfig({ ...env, GEOCODER_VIEWBOX: "3.70,6.88,3.74,6.90" })).toMatchObject({ viewbox: "3.7,6.88,3.74,6.9" });
  });
  it("first asks with the campus as context, so 'Emerald Hall' is not matched to some other town", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify([hit("6.89", "3.72", "A"), hit("6.891", "3.721", "B"), hit("6.892", "3.722", "C")])); }) as unknown as typeof fetch;
    const out = await searchPlaces("Emerald Hall", env, f);
    expect(out).toHaveLength(3);
    expect(decodeURIComponent(urls[0]!.replace(/\+/g, " "))).toMatch(/Emerald Hall, Babcock University/);
    expect(urls).toHaveLength(1); // enough results: the provider is not hit again
  });
  it("falls back to a bounded search, then a plain one, and merges without duplicates", async () => {
    const urls: string[] = []; let n = 0;
    const f = (async (u: string) => { urls.push(u); n++; return new Response(JSON.stringify(n === 1 ? [] : n === 2 ? [hit("6.89", "3.72", "A")] : [hit("6.89", "3.72", "A"), hit("7.1", "3.9", "Z")])); }) as unknown as typeof fetch;
    const out = await searchPlaces("Library", { ...env, GEOCODER_VIEWBOX: "3.70,6.88,3.74,6.90" }, f);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toMatch(/bounded=1/); expect(urls[1]).toMatch(/viewbox=/); expect(urls[2]).not.toMatch(/bounded/);
    expect(out.map((c) => c.label)).toEqual(["A", "Z"]);
  });
});
