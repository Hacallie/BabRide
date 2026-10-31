import { handle } from "@/lib/http";
import { getActor } from "@/lib/session";
import { requireRole } from "@/lib/service";
import { FIXED_FARE_KOBO, CURRENCY } from "@/lib/fare";
export const dynamic = "force-dynamic";
// Read-only in v1: ₦200 PER PASSENGER (20000 kobo), total = that x passengers, enforced by code and a database CHECK constraint.
export const GET = handle(async (req) => {
  requireRole(await getActor(req), "admin");
  return { fareKobo: FIXED_FARE_KOBO, farePerPassengerKobo: FIXED_FARE_KOBO, currency: CURRENCY, editable: false };
});
