import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { adminRiderAction } from "@/lib/service";
import { ApiError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export const POST = handle(async (req, { params }) => {
  const action = params.action;
  if (action !== "approve" && action !== "reject" && action !== "suspend") throw new ApiError(404, "NOT_FOUND", "Not found.");
  return { rider: await adminRiderAction(await getRepo(), await getActor(req), params.id ?? "", action) };
});
