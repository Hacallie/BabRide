
import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import {
  adminSetLocationPosition,
  adminVerifyLocation,
  requireRole,
} from "@/lib/service";
import {
  setLocationPositionSchema,
  verifyLocationSchema,
} from "@/lib/schemas";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/v1/admin/locations/:id/position
// Update a campus landmark's coordinates.
export const POST = handle(async (req, { params }) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const id = params.id ?? "";
  const action = params.action;
  const repo = await getRepo();

  if (action === "position") {
    const input = parse(
      setLocationPositionSchema,
      await jsonBody(req),
    );

    const normalizedInput = {
      ...input,
      confirmReplaceVerified:
        input.confirmReplaceVerified ?? false,
    };

    const location = await adminSetLocationPosition(
      repo,
      actor,
      id,
      normalizedInput,
    );

    return { location };
  }

  if (action === "verify") {
    parse(
      verifyLocationSchema,
      await jsonBody(req),
    );

    const location = await adminVerifyLocation(
      repo,
      actor,
      id,
    );

    return { location };
  }

  throw new ApiError(404, "NOT_FOUND", "Not found.");
});
