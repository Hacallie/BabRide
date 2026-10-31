// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiMock = vi.hoisted(() => vi.fn());
const net = vi.hoisted(() => ({ down: false })); // a plain (un-spied) failure switch: the spy library mishandles rejected promises it records
vi.mock("@/lib/client-api", () => ({ api: (...a: unknown[]) => (net.down ? Promise.reject(new Error("No connection. Check your network and try again.")) : apiMock(...a)), ClientApiError: class extends Error {} }));
import UseMyLocation from "@/components/booking/UseMyLocation";

const EMERALD = { id: "loc-6", name: "Emerald Hall", description: "", latitude: 10.005, longitude: 20.005, verified: false, distanceMeters: 22 };
const CAF = { ...EMERALD, id: "loc-1", name: "CAF", distanceMeters: 640 };
function geolocation(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn(impl) } });
}
const pos = (latitude: number, longitude: number) => ({ coords: { latitude, longitude, accuracy: 12 } }) as unknown as GeolocationPosition;
beforeEach(() => { apiMock.mockReset(); net.down = false; });
afterEach(cleanup);

describe("Use my location", () => {
  it("asks the server for the nearest landmark and hands back its id, name and coordinates (Emerald Hall)", async () => {
    geolocation((ok) => ok(pos(10.00502, 20.00498)));
    apiMock.mockResolvedValue({ status: "matched", match: EMERALD, nearby: [EMERALD], maxMeters: 200 });
    const onMatch = vi.fn(); render(<UseMyLocation onMatch={onMatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() => expect(onMatch).toHaveBeenCalledTimes(1));
    expect(onMatch).toHaveBeenCalledWith(expect.objectContaining({ id: "loc-6", name: "Emerald Hall", latitude: 10.005, longitude: 20.005 }));
    expect(apiMock.mock.calls[0]![0]).toMatch(/\/api\/v1\/campus\/nearest\?latitude=10\.00502&longitude=20\.00498/);
    expect(screen.getByRole("status").textContent).toMatch(/Emerald Hall/);
  });
  it("too far from every landmark: nothing is auto-selected; the nearest options are shown and one can be chosen", async () => {
    geolocation((ok) => ok(pos(10.05, 20.05)));
    apiMock.mockResolvedValue({ status: "too_far", match: null, nearby: [CAF, { ...EMERALD, distanceMeters: 900 }], maxMeters: 200 });
    const onMatch = vi.fn(); render(<UseMyLocation onMatch={onMatch} />);
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(await screen.findByRole("list", { name: "Nearest landmarks" })).toBeTruthy();
    expect(onMatch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /CAF/ }));
    expect(onMatch).toHaveBeenCalledWith(expect.objectContaining({ id: "loc-1" }));
  });
  it("outside the campus service area: a helpful message and no selection", async () => {
    geolocation((ok) => ok(pos(6.5, 3.3))); apiMock.mockResolvedValue({ status: "outside_campus", match: null, nearby: [], maxMeters: 200 });
    const onMatch = vi.fn(); render(<UseMyLocation onMatch={onMatch} />);
    await userEvent.click(screen.getByRole("button")); expect((await screen.findByRole("status")).textContent).toMatch(/outside the campus/);
    expect(onMatch).not.toHaveBeenCalled();
  });
  it("permission denied, timeout and unavailable each explain themselves and keep manual selection possible", async () => {
    for (const [code, text] of [[1, /permission was denied/], [3, /took too long/], [2, /isn't available/]] as const) {
      geolocation((_ok, fail) => fail({ code, message: "x", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
      const onMatch = vi.fn(); const { unmount } = render(<UseMyLocation onMatch={onMatch} />);
      await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
      expect((await screen.findByRole("status")).textContent).toMatch(text);
      expect(onMatch).not.toHaveBeenCalled(); expect(apiMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Use my location" })).toHaveProperty("disabled", false);
      unmount();
    }
  });
  it("a browser without geolocation explains itself", async () => {
    delete (navigator as { geolocation?: unknown }).geolocation;
    render(<UseMyLocation onMatch={vi.fn()} />);
    await userEvent.click(screen.getByRole("button")); expect(screen.getByRole("status").textContent).toMatch(/isn't available on this device/);
  });
  it("a failing server call shows the error and allows a retry", async () => {
    geolocation((ok) => ok(pos(10, 20)));
    net.down = true;
    render(<UseMyLocation onMatch={vi.fn()} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/No connection/));
    expect(screen.getByRole("button", { name: "Use my location" })).toHaveProperty("disabled", false);
  });
});
