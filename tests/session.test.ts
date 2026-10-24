import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/session";

// Fake Supabase admin client: no network. `state` is changed per test.
type Row = Record<string, unknown> | null;
const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as Row,
  provisioned: null as Row,          // row that appears after provision_profile() runs
  lookupError: null as { code: string; message: string } | null,
  rpcError: null as { code: string; message: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}));
vi.mock("@/lib/supabase-admin", () => ({
  adminClient: () => ({
    auth: { getUser: async () => (state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { status: 401, code: "bad_jwt", message: "bad" } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.lookupError ? null : state.profile, error: state.lookupError }) }) }) }),
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      if (!state.rpcError) state.profile = state.provisioned;
      return { data: null, error: state.rpcError };
    },
  }),
}));

const req = (token?: string) => new Request("http://localhost/api/v1/me", { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a".repeat(40));
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "b".repeat(40));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.assign(state, { user: null, profile: null, provisioned: null, lookupError: null, rpcError: null, rpcCalls: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("getActor", () => {
  it("returns null with no bearer token", async () => { expect(await getActor(req())).toBeNull(); });
  it("returns null when Supabase rejects the token", async () => { expect(await getActor(req("t"))).toBeNull(); });
  it("takes the role from the database profile and does not call provision", async () => {
    state.user = { id: "u1" }; state.profile = { id: "u1", full_name: "Ada", role: "student", account_status: "active" };
    expect(await getActor(req("t"))).toEqual({ id: "u1", name: "Ada", role: "student" });
    expect(state.rpcCalls).toHaveLength(0);
  });
  it("self-heals a missing profile through provision_profile with the verified user id", async () => {
    state.user = { id: "u1" };
    state.provisioned = { id: "u1", full_name: "Ada", role: "student", account_status: "active" };
    expect(await getActor(req("t"))).toEqual({ id: "u1", name: "Ada", role: "student" });
    expect(state.rpcCalls).toEqual([{ fn: "provision_profile", args: { p_user: "u1" } }]);
  });
  it("reports a profile that cannot be created as a 403 setup problem, not as signed out", async () => {
    state.user = { id: "u1" };
    await expect(getActor(req("t"))).rejects.toMatchObject({ status: 403, code: "PROFILE_MISSING" });
  });
  it("does not mislabel a database error as a missing profile", async () => {
    state.user = { id: "u1" }; state.lookupError = { code: "42501", message: "permission denied" };
    await expect(getActor(req("t"))).rejects.toMatchObject({ status: 503, code: "PROFILE_LOOKUP_FAILED" });
    expect(state.rpcCalls).toHaveLength(0);
  });
  it("rejects suspended accounts", async () => {
    state.user = { id: "u1" }; state.profile = { id: "u1", full_name: "Ada", role: "student", account_status: "suspended" };
    await expect(getActor(req("t"))).rejects.toMatchObject({ status: 403, code: "SUSPENDED" });
  });
  it("never grants a privileged role when it provisions", async () => {
    state.user = { id: "u1" };
    state.provisioned = { id: "u1", full_name: "Ada", role: "student", account_status: "active" };
    const actor = await getActor(req("t"));
    expect(actor?.role).toBe("student");
  });
});