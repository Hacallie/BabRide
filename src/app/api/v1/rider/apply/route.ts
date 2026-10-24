import { handle, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderApply } from "@/lib/service";
import { riderApplySchema } from "@/lib/schemas";
import { ApiError } from "@/lib/errors";
export const dynamic = "force-dynamic";
// The body may be empty. A tricycle registration is optional, and any "role" field is stripped and ignored.
export const POST = handle(async (req) => {
  const raw = (await req.text()).trim();
  let body: unknown = {};
  if (raw) { try { body = JSON.parse(raw); } catch { throw new ApiError(400, "INVALID_JSON", "Request body must be JSON."); } }
  const { vehicleRegistration } = parse(riderApplySchema, body ?? {});
  return { rider: await riderApply(await getRepo(), await getActor(req), vehicleRegistration?.toUpperCase()) };
}, 201);