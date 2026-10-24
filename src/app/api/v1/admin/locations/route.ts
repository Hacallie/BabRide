
import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import {
  adminAddLocation,
  requireRole,
} from "@/lib/service";
import { addLocationSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/admin/locations
// List campus landmarks for the admin dashboard.
export const GET = handle(async (req) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const repo = await getRepo();
  const locations = await repo.listLocations(true);

  return { locations };
});

// POST /api/v1/admin/locations
// Create a campus landmark.
export const POST = handle(async (req) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const input = parse(
    addLocationSchema,
    await jsonBody(req),
  );

  const repo = await getRepo();

  const location = await adminAddLocation(
    repo,
    actor,
    input,
  );

  return { location };
});
