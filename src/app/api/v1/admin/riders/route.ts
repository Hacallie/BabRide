import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { requireRole } from "@/lib/service";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "admin");
  return { riders: await (await getRepo()).listRiders() };
});
