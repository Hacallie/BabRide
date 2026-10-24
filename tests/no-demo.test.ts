import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appMode } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL"];
const unconfigure = () => KEYS.forEach((k) => vi.stubEnv(k, ""));
const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a".repeat(40));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "b".repeat(40));
};
const withOldDemoCookie = new Request("http://localhost/api/v1/me", { headers: { cookie: "babride_demo_role=admin" } });
afterEach(() => vi.unstubAllEnvs());

describe("no demo mode", () => {
  it("is unconfigured, not demo, when settings are missing", () => {
    unconfigure();
    expect(appMode()).toBe("unconfigured");
  });
  it("refuses data access with HTTP 503 when unconfigured", async () => {
    unconfigure();
    await expect(getRepo()).rejects.toMatchObject({ status: 503, code: "NOT_CONFIGURED" });
  });
  it("ignores the old demo cookie whether configured or not", async () => {
    unconfigure();
    expect(await getActor(withOldDemoCookie)).toBeNull();
    configure();
    expect(appMode()).toBe("supabase");
    expect(await getActor(withOldDemoCookie)).toBeNull(); // no bearer token, so no network call is made
  });
  it("keeps demo and test-repo code out of application source", () => {
    const banned = /BABRIDE_DEMO_MODE|babride_demo_role|api\/v1\/demo|demo-repo|demoBoundary|demoMode|memory-repo/;
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
    const root = path.resolve(__dirname, "..");
    const files = [...walk(path.join(root, "src")), path.join(root, "instrumentation.ts")];
    const hits = files.filter((f) => banned.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });
});
