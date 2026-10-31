import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { adminSetLocationPosition, adminUpdateLocationDetails, adminVerifyLocation } from "@/lib/service";
import { setLocationPositionSchema, updateLocationDetailsSchema, verifyLocationSchema } from "@/lib/schemas";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// PATCH /api/v1/admin/locations/:id  (name, description, pickup/destination allowed, active)
// Never changes coordinates or verification.
export const PATCH = handle(async (req, { params }) => {
  const input = parse(updateLocationDetailsSchema, await jsonBody(req));
  return { location: await adminUpdateLocationDetails(await getRepo(), await getActor(req), params.id ?? "", input) };
});

// POST /api/v1/admin/locations/:id/position  and  /verify.
// ROOT CAUSE FIX: the admin screen has always called these two URLs, but this file only exported PATCH, so every
// "Save location" got HTTP 405 and no coordinates were ever stored. The landmarks therefore stayed "not located".
export const POST = handle(async (req, { params }) => {
  const id = params.id ?? "";
  if (params.action === "position") {
    const input = parse(setLocationPositionSchema, await jsonBody(req));
    return { location: await adminSetLocationPosition(await getRepo(), await getActor(req), id, input) };
  }
  if (params.action === "verify") {
    parse(verifyLocationSchema, await jsonBody(req));
    return { location: await adminVerifyLocation(await getRepo(), await getActor(req), id) };
  }
  throw new ApiError(404, "NOT_FOUND", "Not found.");
});
