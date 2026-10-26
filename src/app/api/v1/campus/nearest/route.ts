import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { nearestLandmark } from "@/lib/service";
import { nearestBodySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
// POST /api/v1/campus/nearest  { latitude, longitude }
// Finds the nearest located campus landmark within the configured distance. Public on purpose (the home page uses it before
// sign-in) and it returns ONLY ids, names and distances, never coordinates. The browser's position is an input, not a fact:
// the ride is still booked and priced by landmark id on the server.
export const POST = handle(async (req) => {
  const p = parse(nearestBodySchema, await jsonBody(req));
  return nearestLandmark(await getRepo(), p);
});
