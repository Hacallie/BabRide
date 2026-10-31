import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderEndSession } from "@/lib/service";
export const dynamic = "force-dynamic";
// Called on sign-out (best effort; the heartbeat expiry covers closed tabs and expired sessions).
export const POST = handle(async (req) => riderEndSession(await getRepo(), await getActor(req)));
