import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { adminDashboard } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => adminDashboard(await getRepo(), await getActor(req)));
