import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { adminUpdateLocationDetails } from "@/lib/service";
import { updateLocationDetailsSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// PATCH /api/v1/admin/locations/:id  (name, description, pickup/destination allowed, active)
// Never changes coordinates or verification: use POST .../position and POST .../verify for those.
export const PATCH = handle(async (req, { params }) => {
  const input = parse(updateLocationDetailsSchema, await jsonBody(req));
  return { location: await adminUpdateLocationDetails(await getRepo(), await getActor(req), params.id ?? "", input) };
});
