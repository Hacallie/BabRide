import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { rideAction, type RideAction } from "@/lib/service";
import { ApiError } from "@/lib/errors";
export const dynamic = "force-dynamic";
const ACTIONS = ["cancel", "accept", "release", "depart", "arrive", "start", "complete", "collect-cash"];
export const POST = handle(async (req, { params }) => {
  const action = params.action ?? "";
  if (!ACTIONS.includes(action)) throw new ApiError(404, "NOT_FOUND", "Not found.");
  return { ride: await rideAction(await getRepo(), await getActor(req), params.id ?? "", action as RideAction) };
});
