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

describe("rider registration", () => {
  it("does not ask for passenger seat capacity", async () => {
    render(<RiderJoin />);

    expect(screen.queryByLabelText(/Passenger seat capacity/i)).toBeNull();
    expect(screen.queryByText(/Do not count yourself/i)).toBeNull();

    expect(
      await screen.findByRole("button", { name: /register rider account/i })
    ).toBeTruthy();
  });

  it("submits registration without a seatCapacity field", async () => {
    const user = userEvent.setup();
    render(<RiderJoin />);

    const button = await screen.findByRole("button", {
      name: /register rider account/i,
    });

    await user.click(button);

    await waitFor(() => {
      expect(
        h.calls.find((c) => c.path === "/api/v1/rider/apply")?.body
      ).toEqual({});
    });
  });
});
