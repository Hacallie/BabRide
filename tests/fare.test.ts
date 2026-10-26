import { describe, it, expect } from "vitest";
import { quoteFare, pointInPolygon, FIXED_FARE_KOBO, totalFareKobo } from "@/lib/fare";

// TEST-ONLY square. NOT real Babcock coordinates.
const square: [number, number][] = [[0,0],[0,10],[10,10],[10,0]];
const cfg = { boundary: square };

describe("fare engine", () => {
  it("is 20000 kobo for any eligible trip regardless of distance", () => {
    const near = quoteFare({latitude:1,longitude:1},{latitude:1,longitude:2},cfg);
    const far = quoteFare({latitude:0.5,longitude:0.5},{latitude:9.5,longitude:9.5},cfg);
    expect(near).toEqual({ ok:true, fareKobo:FIXED_FARE_KOBO, currency:"NGN" });
    expect(far).toEqual(near);
  });
  it("rejects out-of-area pickup and destination", () => {
    expect(quoteFare({latitude:50,longitude:50},{latitude:1,longitude:1},cfg)).toMatchObject({ok:false,code:"PICKUP_OUT_OF_AREA"});
    expect(quoteFare({latitude:1,longitude:1},{latitude:50,longitude:50},cfg)).toMatchObject({ok:false,code:"DESTINATION_OUT_OF_AREA"});
  });
  it("rejects same location and invalid coordinates", () => {
    expect(quoteFare({latitude:1,longitude:1},{latitude:1,longitude:1},cfg)).toMatchObject({code:"SAME_LOCATION"});
    expect(quoteFare({latitude:NaN,longitude:1},{latitude:1,longitude:1},cfg)).toMatchObject({code:"INVALID_COORDINATES"});
  });
  it("refuses to quote when the boundary is unset (there is no bypass)", () => {
    expect(quoteFare({latitude:1,longitude:1},{latitude:2,longitude:2},{boundary:null})).toMatchObject({code:"BOUNDARY_NOT_CONFIGURED"});
  });
  it("throws if institution fare is tampered", () => {
    expect(() => quoteFare({latitude:1,longitude:1},{latitude:2,longitude:2},{...cfg,fareKobo:5000})).toThrow();
  });
  it("point in polygon works", () => {
    expect(pointInPolygon({latitude:5,longitude:5},square)).toBe(true);
    expect(pointInPolygon({latitude:15,longitude:5},square)).toBe(false);
  });
});

describe("per-passenger total", () => {
  it("is 20000 kobo x passengers: 1 = ₦200, 2 = ₦400, 3 = ₦600, 4 = ₦800", () => {
    expect([1, 2, 3, 4].map((n) => totalFareKobo(n))).toEqual([20000, 40000, 60000, 80000]);
  });
  it("refuses zero, negative, fractional and non-numeric passenger counts", () => {
    for (const bad of [0, -1, 2.5, NaN, Infinity]) expect(() => totalFareKobo(bad)).toThrow();
  });
  it("refuses a tampered per-passenger fare", () => { expect(() => totalFareKobo(2, 5000)).toThrow(); });
});
