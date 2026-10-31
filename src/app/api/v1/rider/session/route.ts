import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderSessionEnd, riderSessionStart } from "@/lib/service";
import { z } from "zod";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ action: z.enum(["start", "end"]) });

// POST /api/v1/rider/session  { action: "start" | "end" }
//   start: called right after a rider signs in. Approved riders are set online in the database; others stay offline with a reason.
//   end:   called on sign-out. Always sets the rider offline. Customers and admins get 403: they can never be marked as drivers.
export const POST = handle(async (req) => {
  const { action } = parse(bodySchema, await jsonBody(req));
  const repo = await getRepo(); const actor = await getActor(req);
  return action === "start" ? riderSessionStart(repo, actor) : riderSessionEnd(repo, actor);
});
