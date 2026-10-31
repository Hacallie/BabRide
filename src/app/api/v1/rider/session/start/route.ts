import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderStartSession } from "@/lib/service";
export const dynamic = "force-dynamic";
// Called right after a successful sign-in. Riders only; an ineligible rider gets 200 {online:false, reason}.
export const POST = handle(async (req) => riderStartSession(await getRepo(), await getActor(req)));
