import { describe, expect, it } from "vitest";
import { formatEnvReport, validateEnv, type EnvSource } from "@/lib/env";

const SECRET = "s".repeat(24) + "-UNIQUE-SECRET-VALUE";
const good: EnvSource = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40),
  SUPABASE_SERVICE_ROLE_KEY: SECRET,
};

describe("environment validation", () => {
  it("accepts a complete configuration", () => {
    expect(validateEnv(good)).toMatchObject({ ok: true, missing: [], invalid: [], forbidden: [] });
  });
  it("lists missing variable NAMES", () => {
    const r = validateEnv({});
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  });
  it("never puts a value in its report or formatted output", () => {
    const env = { ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "short-but-secret" };
    const r = validateEnv(env);
    for (const text of [JSON.stringify(r), formatEnvReport(r), formatEnvReport(validateEnv(good))]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("short-but-secret");
    }
    expect(r.invalid).toEqual([{ name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", reason: "too short to be a real key" }]);
  });
  it("rejects placeholders and malformed URLs", () => {
    const r = validateEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "your-project-url", SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key" });
    expect(r.ok).toBe(false);
    expect(r.invalid.map((i) => i.name).sort()).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(validateEnv({ ...good, NEXT_PUBLIC_SUPABASE_URL: "not a url" }).ok).toBe(false);
  });
  it("requires NEXT_PUBLIC_APP_URL over https only in production", () => {
    expect(validateEnv(good).ok).toBe(true);
    expect(validateEnv({ ...good, NODE_ENV: "production" }).missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(validateEnv({ ...good, NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://example.com" }).invalid[0]?.reason).toMatch(/https/);
    expect(validateEnv({ ...good, NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://example.com" }).ok).toBe(true);
  });
  it("flags a secret exposed through a NEXT_PUBLIC_ name", () => {
    const r = validateEnv({ ...good, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: SECRET });
    expect(r.ok).toBe(false);
    expect(r.forbidden).toEqual(["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"]);
  });
  it("rejects using the anon key as the service-role key", () => {
    const r = validateEnv({ ...good, SUPABASE_SERVICE_ROLE_KEY: good.NEXT_PUBLIC_SUPABASE_ANON_KEY });
    expect(r.invalid).toEqual([{ name: "SUPABASE_SERVICE_ROLE_KEY", reason: "must differ from the anon key" }]);
  });
  it("validates the optional timeout only when set", () => {
    expect(validateEnv({ ...good, BABRIDE_SEARCH_TIMEOUT_MIN: "10" }).ok).toBe(true);
    expect(validateEnv({ ...good, BABRIDE_SEARCH_TIMEOUT_MIN: "abc" }).ok).toBe(false);
  });
});
