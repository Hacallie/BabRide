import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { adminRiderAction, adminSetVehicleCapacity } from "@/lib/service";
import { vehicleCapacitySchema } from "@/lib/schemas";
import { ApiError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export const POST = handle(async (req, { params }) => {
  const action = params.action;
  if (action === "capacity") {
    const { capacity } = parse(vehicleCapacitySchema, await jsonBody(req));
    return { rider: await adminSetVehicleCapacity(await getRepo(), await getActor(req), params.id ?? "", capacity) };
  }
  if (action !== "approve" && action !== "reject" && action !== "suspend") throw new ApiError(404, "NOT_FOUND", "Not found.");
  return { rider: await adminRiderAction(await getRepo(), await getActor(req), params.id ?? "", action) };
});
