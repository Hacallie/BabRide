import { handle, parse } from "@/lib/http";
import { getActor } from "@/lib/session";
import { requireRole } from "@/lib/service";
import { searchPlaces } from "@/lib/geocode";
import { getRepo } from "@/lib/repo";
import { geocodeQuerySchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
// Admin-only place search for the landmark picker. The provider call happens on the server; no key reaches the browser.
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "admin");
  const { q } = parse(geocodeQuerySchema, { q: new URL(req.url).searchParams.get("q") ?? "" });
  return { candidates: await searchPlaces(q, process.env, fetch, await (await getRepo()).getBoundary()) };
});