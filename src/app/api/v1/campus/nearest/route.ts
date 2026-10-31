import { handle, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { nearestCampusLandmark } from "@/lib/service";
import { nearestQuerySchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
// PUBLIC. "Use my location": the SERVER finds the nearest located landmark (haversine) within BABRIDE_NEAREST_MAX_METERS.
// The browser's coordinates are only a search input here; the booking itself uses the landmark id and server-side coordinates.
export const GET = handle(async (req) => {
  const q = parse(nearestQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  return nearestCampusLandmark(await getRepo(), { latitude: q.latitude, longitude: q.longitude });
});
