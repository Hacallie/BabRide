import { handle, parse } from "@/lib/http";
import { getActor } from "@/lib/session";
import { requireRole } from "@/lib/service";
import { searchPlacesDetailed } from "@/lib/geocode";
import { getRepo } from "@/lib/repo";
import { searchRadiusMeters } from "@/lib/config";
import { geocodeQuerySchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
// Admin-only place search for the landmark picker. The provider call happens on the server; no key reaches the browser.
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "admin");
  const { q } = parse(geocodeQuerySchema, { q: new URL(req.url).searchParams.get("q") ?? "" });
  // Campus-only: with a polygon, results must be inside it; without one, near a landmark that is already located.
  const repo = await getRepo();
  const anchors = (await repo.listLocations()).filter((l) => l.status !== "placeholder").map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
  const { candidates, filteredOut } = await searchPlacesDetailed(q, process.env, fetch, { boundary: await repo.getBoundary(), anchors, maxMeters: searchRadiusMeters() });
  return { candidates, filteredOut };
});