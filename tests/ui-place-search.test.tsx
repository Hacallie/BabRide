// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlaceSearch from "@/components/PlaceSearch";

afterEach(cleanup);
interface Hit { id: string; label: string; latitude: number; longitude: number }
const EMERALD: Hit = { id: "emerald", label: "Emerald Hall", latitude: 10.005, longitude: 20.005 };

/** Mirrors the real admin screen: the search box sits INSIDE another form ("Add landmark"). */
function Harness({ search, onSelect, outerSubmit }: { search: (q: string) => Promise<Hit[]>; onSelect: (h: Hit) => void; outerSubmit: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); outerSubmit(); }}>
      <PlaceSearch<Hit> id="t" label="Find the place" search={search} resultKey={(h) => h.id} renderResult={(h) => h.label} onSelect={onSelect} />
      <button>Add landmark</button>
    </form>
  );
}
const setup = (search = vi.fn(async (_q: string): Promise<Hit[]> => [EMERALD])) => {
  const onSelect = vi.fn(); const outerSubmit = vi.fn(); const navigated = vi.fn();
  document.addEventListener("submit", navigated); // any native form submit anywhere would show up here
  const view = render(<Harness search={search} onSelect={onSelect} outerSubmit={outerSubmit} />);
  return { search, onSelect, outerSubmit, navigated, view, user: userEvent.setup() };
};
afterEach(() => document.removeEventListener("submit", () => {}));

describe("map search does not reload the page and returns results", () => {
  it("renders no <form> of its own (nothing to submit natively, nothing nested in the admin form)", () => {
    setup();
    expect(screen.getByRole("search").closest("form")).not.toBeNull(); // the harness's outer form
    expect(screen.getByRole("search").querySelector("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveProperty("type", "button");
  });
  it("pressing the Search button runs the search, shows results and submits no form", async () => {
    const { user, search, navigated, outerSubmit } = setup();
    await user.type(screen.getByRole("searchbox"), "Emerald");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(search).toHaveBeenCalledWith("Emerald", expect.any(AbortSignal));
    expect(await screen.findByRole("button", { name: "Emerald Hall" })).toBeTruthy();
    expect(navigated).not.toHaveBeenCalled(); expect(outerSubmit).not.toHaveBeenCalled();
  });
  it("pressing Enter searches and does NOT submit the surrounding 'Add landmark' form", async () => {
    const { user, search, navigated, outerSubmit } = setup();
    await user.type(screen.getByRole("searchbox"), "Emerald{Enter}");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(navigated).not.toHaveBeenCalled(); expect(outerSubmit).not.toHaveBeenCalled();
  });
  it("clicking a result selects exactly that place (coordinates and label) and closes the list", async () => {
    const { user, onSelect } = setup();
    await user.type(screen.getByRole("searchbox"), "Emerald");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Emerald Hall" }));
    expect(onSelect).toHaveBeenCalledTimes(1); expect(onSelect).toHaveBeenCalledWith(EMERALD);
    expect(screen.queryByRole("list", { name: "Search results" })).toBeNull();
  });
  it("shows a loading state and ignores a second press while searching", async () => {
    let release!: (v: Hit[]) => void;
    const { user, search } = setup(vi.fn(() => new Promise<Hit[]>((r) => { release = r; })));
    await user.type(screen.getByRole("searchbox"), "Emerald");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const busy = screen.getByRole("button", { name: "Searching…" }); expect(busy).toHaveProperty("disabled", true);
    await user.click(busy); expect(search).toHaveBeenCalledTimes(1);
    release([EMERALD]); expect(await screen.findByRole("button", { name: "Emerald Hall" })).toBeTruthy();
  });
  it("empty results, network errors and too-short queries each get a clear message", async () => {
    const empty = setup(vi.fn(async () => []));
    await empty.user.type(screen.getByRole("searchbox"), "zzzz"); await empty.user.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/No matches/);
    cleanup();
    const failing = setup(vi.fn(async () => { throw new Error("No connection. Check your network and try again."); }));
    await failing.user.type(screen.getByRole("searchbox"), "Emerald"); await failing.user.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/No connection/);
    expect(screen.getByRole("button", { name: "Search" })).toHaveProperty("disabled", false); // can retry
    cleanup();
    const short = setup();
    await short.user.type(screen.getByRole("searchbox"), "ab"); await short.user.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/at least 3/); expect(short.search).not.toHaveBeenCalled();
  });
});
