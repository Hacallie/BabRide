import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminal, RIDE_STATUSES } from "@/lib/ride-state";

describe("ride state machine", () => {
  it("allows the happy path", () => {
    const path = ["searching","assigned","rider_arriving","rider_arrived","in_progress","completed"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i+1]!)).toBe(true);
  });
  it("blocks skipping states", () => {
    expect(canTransition("searching","completed")).toBe(false);
    expect(canTransition("assigned","in_progress")).toBe(false);
    expect(() => assertTransition("searching","completed")).toThrow();
  });
  it("terminal states have no exits", () => {
    for (const s of ["completed","cancelled","expired"] as const) {
      expect(isTerminal(s)).toBe(true);
      for (const t of RIDE_STATUSES) expect(canTransition(s,t)).toBe(false);
    }
  });
  it("cannot cancel once in progress", () => expect(canTransition("in_progress","cancelled")).toBe(false));
});
