
import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import {
  adminAddLocation,
  requireRole,
} from "@/lib/service";
import { addLocationSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// GET /api/v1/admin/locations
export const GET = handle(async (req) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const repo = await getRepo();

  return {
    locations: await repo.listLocations(true),
  };
});

// POST /api/v1/admin/locations
export const POST = handle(async (req) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const input = parse(
    addLocationSchema,
    await jsonBody(req),
  );

  const location = await adminAddLocation(
    await getRepo(),
    actor,
    input,
  );

  return { location };
});
