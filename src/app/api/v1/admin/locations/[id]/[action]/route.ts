
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

// POST /api/v1/admin/locations/:id/position
// POST /api/v1/admin/locations/:id/verify
export const POST = handle(async (req, { params }) => {
  const actor = await getActor(req);
  requireRole(actor, "admin");

  const id = params.id ?? "";

  if (params.action === "position") {
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
      await getRepo(),
      actor,
      id,
      normalizedInput,
    );

    return { location };
  }

  if (params.action === "verify") {
    parse(
      verifyLocationSchema,
      await jsonBody(req),
    );

    const location = await adminVerifyLocation(
      await getRepo(),
      actor,
      id,
    );

    return { location };
  }

  throw new ApiError(404, "NOT_FOUND", "Not found.");
});
