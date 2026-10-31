
import { handle, jsonBody, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { getActor } from "@/lib/session";
import { riderApply } from "@/lib/service";
import { riderApplySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const body = await jsonBody(req);

  const { vehicleRegistration } = parse(riderApplySchema, body ?? {});

  const normalizedRegistration =
    typeof vehicleRegistration === "string"
      ? vehicleRegistration.toUpperCase()
      : undefined;

  return {
    rider: await riderApply(
      await getRepo(),
      await getActor(req),
      { vehicleRegistration: normalizedRegistration },
    ),
  };
}, 201);
