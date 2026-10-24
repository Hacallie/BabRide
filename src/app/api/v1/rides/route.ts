import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { createRide, listMyRides } from "@/lib/service";
import { createRideSchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
export const GET = handle(async (req) => ({ rides: await listMyRides(await getRepo(), await getActor(req)) }));
// Any "fare" field in the body is stripped by the schema; the server computes it.
export const POST = handle(async (req) => {
  const input = parse(createRideSchema, await jsonBody(req));
  return { ride: await createRide(await getRepo(), await getActor(req), input) };
}, 201);
