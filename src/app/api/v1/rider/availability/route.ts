import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderSetOnline } from "@/lib/service";
import { availabilitySchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
export const POST = handle(async (req) => {
  const { online } = parse(availabilitySchema, await jsonBody(req));
  await riderSetOnline(await getRepo(), await getActor(req), online);
  return { online };
});
