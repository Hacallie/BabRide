import { handle } from "@/lib/http";
import { getActor } from "@/lib/session";
import { requireRole } from "@/lib/service";
import { FIXED_FARE_KOBO, CURRENCY } from "@/lib/fare";
export const dynamic = "force-dynamic";
// Read-only in v1: the fare is locked at 20000 kobo by code and a database CHECK constraint.
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "admin");
  return { fareKobo: FIXED_FARE_KOBO, currency: CURRENCY, editable: false };
});
