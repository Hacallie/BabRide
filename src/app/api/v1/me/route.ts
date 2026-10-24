import { appMode } from "@/lib/config";
import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { ApiError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const repo = await getRepo();
  const actor = await getActor(req);
  if (!actor) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
  const rider = actor.role === "rider" ? await repo.getRider(actor.id) : null;
  return { actor, mode: appMode(), rider };
});
