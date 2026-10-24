import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderRequests } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => riderRequests(await getRepo(), await getActor(req)));
