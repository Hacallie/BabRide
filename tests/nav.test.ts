import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { navFor, PUBLIC_LINKS, showsBookCta, showsPublicMarketing, type AuthView } from "@/lib/nav";

const labels = (v: AuthView) => navFor(v).map((l) => l.label);
const SRC = path.resolve(__dirname, "..", "src");

describe("navigation by sign-in state", () => {
  it("signed-out visitors keep the public marketing navigation, including Sign in and Create account", () => {
    expect(labels({ s: "anon" })).toEqual(["Home", "How It Works", "Campus Locations", "Become a Rider", "Sign in", "Create account"]);
    expect(showsPublicMarketing({ s: "anon" })).toBe(true); expect(showsBookCta({ s: "anon" })).toBe(true);
  });
  it("while the session is loading, NEITHER menu is shown (no flash of the wrong navigation)", () => {
    expect(navFor({ s: "loading" })).toEqual([]);
    expect(showsPublicMarketing({ s: "loading" })).toBe(false); expect(showsBookCta({ s: "loading" })).toBe(false);
  });
  it("signed-in users never see the marketing links, Sign in or Create account", () => {
    const publicLabels = PUBLIC_LINKS.map((l) => l.label);
    for (const role of ["student", "rider", "admin"] as const) {
      const got = labels({ s: "auth", role, name: "N" });
      for (const marketing of ["Home", "How It Works", "Campus Locations", "Become a Rider", "Sign in", "Create account"]) expect(got).not.toContain(marketing);
      expect(showsPublicMarketing({ s: "auth", role, name: "N" })).toBe(false);
      expect(publicLabels.length).toBeGreaterThan(0);
    }
  });
  it("customers get booking and their rides; riders get their dashboard; admins only the admin dashboard", () => {
    expect(labels({ s: "auth", role: "student", name: "N" })).toEqual(["Book a Ride", "My Rides"]);
    expect(labels({ s: "auth", role: "rider", name: "N" })).toEqual(["Dashboard", "Ride requests", "My trips"]);
    expect(labels({ s: "auth", role: "admin", name: "N" })).toEqual(["Admin dashboard"]);
  });
  it("administration links are shown to administrators only", () => {
    for (const role of ["student", "rider"] as const) expect(navFor({ s: "auth", role, name: "N" }).some((l) => l.href.startsWith("/admin"))).toBe(false);
    expect(showsBookCta({ s: "auth", role: "admin", name: "N" })).toBe(false); expect(showsBookCta({ s: "auth", role: "rider", name: "N" })).toBe(false);
  });
  it("the real header is wired to this logic and signs riders offline before signing out", () => {
    const header = fs.readFileSync(path.join(SRC, "components/SiteHeader.tsx"), "utf8");
    expect(header).toContain("navFor("); expect(header).toContain("signOutEverywhere");
    const signOut = fs.readFileSync(path.join(SRC, "lib/sign-out.ts"), "utf8");
    expect(signOut.indexOf("/api/v1/rider/session")).toBeGreaterThan(-1);
    expect(signOut.indexOf("/api/v1/rider/session")).toBeLessThan(signOut.indexOf("signOut()"));
  });
});
