// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

const h = vi.hoisted(() => ({
  session: null as unknown, me: null as unknown, meStatus: 200, authCb: null as null | ((e: string) => void), calls: [] as string[],
  signOut: vi.fn(async () => {}), getSession: null as null | (() => Promise<unknown>),
}));
vi.mock("next/link", async () => { const React = await import("react"); return { default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...p }, children) }; });
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/supabase-browser", () => ({
  browserSupabase: () => ({ auth: {
    getSession: () => (h.getSession ? h.getSession() : Promise.resolve({ data: { session: h.session } })),
    onAuthStateChange: (cb: (e: string) => void) => { h.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: h.signOut } }),
}));
vi.mock("@/lib/client-api", async () => {
  class ClientApiError extends Error { constructor(m: string, public status: number) { super(m); } }
  return { ClientApiError, api: (path: string) => { h.calls.push(path); return h.meStatus === 200 ? Promise.resolve(h.me) : Promise.reject(new ClientApiError("x", h.meStatus)); } };
});
import SiteHeader from "@/components/SiteHeader";

const PUBLIC = ["Home", "How It Works", "Campus Locations", "Become a Rider", "Sign in", "Create account"];
const actor = (role: string) => ({ actor: { id: "u1", name: "Ada Obi", role, status: "active" }, rider: null });
const names = () => screen.queryAllByRole("link").map((a) => a.textContent);
beforeEach(() => { h.session = null; h.me = null; h.meStatus = 200; h.calls = []; h.getSession = null; h.signOut.mockClear(); h.authCb = null;
  Object.defineProperty(window, "location", { configurable: true, value: { assign: vi.fn() } }); });
afterEach(cleanup);

describe("navigation", () => {
  it("signed-out visitors keep the public marketing navigation (and no session lookup hits the server)", async () => {
    render(<SiteHeader />);
    for (const label of PUBLIC) expect(await screen.findAllByRole("link", { name: label })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Book a Ride" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull(); expect(h.calls).toEqual([]);
  });
  it("while the session loads NEITHER navigation is shown (no wrong-nav flash)", async () => {
    let release!: (v: unknown) => void; h.getSession = () => new Promise((r) => { release = r; });
    render(<SiteHeader />);
    expect(names().filter((n) => n && n !== "Bab Ride" && !/^Bab/.test(n))).toEqual([]);
    expect(screen.queryByText("Sign in")).toBeNull();
    release({ data: { session: null } }); expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("server-rendered HTML is the neutral shell for everyone, so hydration cannot mismatch", () => {
    const html = renderToString(<SiteHeader />);
    for (const label of [...PUBLIC, "Sign Out", "My Rides", "Dashboard", "Admin dashboard"]) expect(html).not.toContain(`>${label}<`);
    expect(html).toContain("Bab");
  });
  it("a customer sees customer links and Sign Out, and none of the marketing links", async () => {
    h.session = { user: {} }; h.me = actor("student");
    render(<SiteHeader />);
    expect(await screen.findByRole("button", { name: "Sign Out" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Book a Ride" })[0]).toHaveProperty("href", expect.stringContaining("/student"));
    expect(screen.getByRole("link", { name: "My Rides" })).toHaveProperty("href", expect.stringContaining("/student#hist"));
    for (const label of PUBLIC) expect(screen.queryByRole("link", { name: label }), label).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin dashboard" })).toBeNull(); expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });
  it("a rider sees dashboard, requests, trips, an availability pill and Sign Out; the pill follows status changes", async () => {
    h.session = { user: {} }; h.me = { ...actor("rider"), rider: { userId: "u1", name: "R", approval: "approved", online: true, vehicle: null } };
    render(<SiteHeader />);
    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ride requests" })).toBeTruthy(); expect(screen.getByRole("link", { name: "Recent trips" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Availability: online/ }).length).toBeGreaterThan(0);
    act(() => { window.dispatchEvent(new CustomEvent("babride:rider-status", { detail: false })); });
    expect(screen.getAllByRole("link", { name: /Availability: offline/ }).length).toBeGreaterThan(0);
    for (const label of PUBLIC) expect(screen.queryByRole("link", { name: label })).toBeNull();
  });
  it("an administrator sees admin links only; a customer never does", async () => {
    h.session = { user: {} }; h.me = actor("admin"); render(<SiteHeader />);
    expect(await screen.findByRole("link", { name: "Admin dashboard" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "My Rides" })).toBeNull(); expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
  it("the role comes from the server: a session the server rejects (401) falls back to the public navigation", async () => {
    h.session = { user: {} }; h.meStatus = 401; render(<SiteHeader />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();
  });
  it("a temporary server error shows only Sign Out, never the wrong menu", async () => {
    h.session = { user: {} }; h.meStatus = 500; render(<SiteHeader />);
    expect(await screen.findByRole("button", { name: "Sign Out" })).toBeTruthy(); expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
  it("signing in elsewhere on the page swaps the navigation, and signing out swaps it back", async () => {
    render(<SiteHeader />); expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    h.session = { user: {} }; h.me = actor("student"); act(() => h.authCb!("SIGNED_IN"));
    expect(await screen.findByRole("button", { name: "Sign Out" })).toBeTruthy(); expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    act(() => h.authCb!("SIGNED_OUT")); expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("a rider's Sign Out takes them offline first, then signs out; a customer's does not call the rider endpoint", async () => {
    const apiCalls: string[] = []; h.session = { user: {} }; h.me = { ...actor("rider"), rider: { userId: "u1", name: "R", approval: "approved", online: true, vehicle: null } };
    render(<SiteHeader />); await userEvent.click(await screen.findByRole("button", { name: "Sign Out" }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    expect(h.calls).toContain("/api/v1/rider/session/end"); expect((window.location as unknown as { assign: ReturnType<typeof vi.fn> }).assign).toHaveBeenCalledWith("/login");
    cleanup(); h.calls = []; h.me = actor("student"); render(<SiteHeader />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign Out" })); await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(2));
    expect(h.calls).not.toContain("/api/v1/rider/session/end"); void apiCalls;
  });
});
