import { handle, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { quote, requireRole } from "@/lib/service";
import { quoteQuerySchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "student");
  const q = parse(quoteQuerySchema, Object.fromEntries(new URL(req.url).searchParams));
  return quote(await getRepo(), { latitude: q.latitude, longitude: q.longitude, locationId: q.locationId }, q.destinationLocationId);
});
