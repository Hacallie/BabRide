// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({ calls: [] as { path: string; body?: unknown }[] }));
vi.mock("next/link", async () => { const React = await import("react"); return { default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...p }, children) }; });
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace() {}, push() {} }) }));
vi.mock("@/lib/supabase-browser", () => ({ browserSupabase: () => null }));
vi.mock("@/components/auth/AuthPanel", () => ({ default: () => null }));
vi.mock("@/lib/client-api", async () => {
  class ClientApiError extends Error { constructor(m: string, public status: number) { super(m); } }
  return { ClientApiError, api: async (path: string, o?: { body?: unknown }) => {
    h.calls.push({ path, body: o?.body });
    if (path === "/api/v1/mode") return { maxVehicleSeats: 6, maxPassengers: 4 };
    if (path === "/api/v1/me") return { actor: { id: "u", name: "Ada", role: "student", status: "active" }, rider: null };
    return {}; } };
});
import FareSummary from "@/components/booking/FareSummary";
import RiderJoin from "@/app/(auth)/rider/join/page";

beforeEach(() => { h.calls = []; });
afterEach(cleanup);

describe("fare display updates with the passenger count", () => {
  it("shows ₦200 per passenger and the total for 1, 2, 3 and 4", () => {
    const { rerender } = render(<FareSummary passengers={1} />);
    for (const [n, total] of [[1, "₦200"], [2, "₦400"], [3, "₦600"], [4, "₦800"]] as const) {
      rerender(<FareSummary passengers={n} />);
      expect(screen.getByTestId("fare-each").textContent).toBe("₦200"); expect(screen.getByTestId("fare-total").textContent).toBe(total);
    }
  });
  it("falls back to one passenger for nonsense input rather than showing a wrong fare", () => {
    render(<FareSummary passengers={0} />); expect(screen.getByTestId("fare-total").textContent).toBe("₦200");
  });
});

describe("rider registration asks for passenger seats", () => {
  const openForm = async () => { render(<RiderJoin />); return screen.findByLabelText("Passenger seat capacity"); };
  const submit = () => screen.getByRole("button", { name: /apply|submit|become|register|send/i });
  it("shows a required Passenger seat capacity field that says the driver is not counted", async () => {
    const f = await openForm(); expect(f).toHaveProperty("required", true);
    expect(screen.getByText(/Do not count yourself/i)).toBeTruthy();
  });
  it("blocks an empty or invalid value in the browser and never calls the server", async () => {
    const f = await openForm();
    await userEvent.click(submit()); expect((await screen.findByRole("alert")).textContent).toMatch(/whole number of passenger seats from 1 to 6/);
    await userEvent.type(f, "0"); await userEvent.click(submit()); expect(screen.getByRole("alert").textContent).toMatch(/1 to 6/);
    await userEvent.clear(f); await userEvent.type(f, "9"); await userEvent.click(submit()); expect(screen.getByRole("alert").textContent).toMatch(/1 to 6/);
    expect(h.calls.some((c) => c.path === "/api/v1/rider/apply")).toBe(false);
  });
  it("only digits can be typed, and a valid number is sent to the server as seatCapacity", async () => {
    const f = await openForm(); await userEvent.type(f, "a3"); expect((f as HTMLInputElement).value).toBe("3");
    await userEvent.click(submit());
    await waitFor(() => expect(h.calls.find((c) => c.path === "/api/v1/rider/apply")?.body).toEqual({ seatCapacity: 3 }));
  });
});
