// SERVER ONLY. Resolves the signed-in user. Role always comes from the database, never from the client.
import { appMode } from "@/lib/config";
import type { Actor, Role } from "@/lib/types";
import { ApiError } from "@/lib/errors";

type ProfileRow = { id: string; full_name: string; role: string; account_status: string };
const COLUMNS = "id, full_name, role, account_status";

export async function getActor(req: Request): Promise<Actor | null> {
  const mode = appMode();
  if (mode === "supabase") {
    const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    if (!token) return null;
    const { adminClient } = await import("@/lib/supabase-admin");
    const db = adminClient();
    const { data: u, error } = await db.auth.getUser(token);
    if (error || !u.user) {
      // Expired/invalid tokens are normal (401). Dev log helps tell them apart from a wrong service-role key.
      if (process.env.NODE_ENV !== "production") console.warn(`[auth] token not accepted by Supabase (status ${error?.status ?? "n/a"}, code ${error?.code ?? "n/a"})`);
      return null;
    }
    const userId = u.user.id; // from the verified token, never from the request body or URL

    let lookup = await db.from("profiles").select(COLUMNS).eq("id", userId).maybeSingle();
    // A database/permission error is NOT "no profile". Do not mislabel it.
    if (lookup.error) {
      console.error(`[auth] profile lookup failed (code ${lookup.error.code ?? "n/a"})`);
      throw new ApiError(503, "PROFILE_LOOKUP_FAILED", "We couldn't load your account right now. Please try again.");
    }

    let p = lookup.data as ProfileRow | null;
    if (!p) {
      // Verified session, no profile row (user predates the trigger, or the institution was missing at signup).
      // Self-heal once through provision_profile(): idempotent, never overwrites an existing row, and always
      // creates a 'student'. Rider/admin roles are never granted here.
      const { error: rpcError } = await db.rpc("provision_profile", { p_user: userId });
      if (rpcError) console.error(`[auth] provision_profile failed (code ${rpcError.code ?? "n/a"})`);
      lookup = await db.from("profiles").select(COLUMNS).eq("id", userId).maybeSingle();
      if (lookup.error) throw new ApiError(503, "PROFILE_LOOKUP_FAILED", "We couldn't load your account right now. Please try again.");
      p = lookup.data as ProfileRow | null;
    }
    if (!p) {
      console.error("[auth] valid Supabase session but profile could not be created. Apply supabase/migrations/0003_profile_provisioning.sql and confirm public.institutions has slug 'babcock'.");
      throw new ApiError(403, "PROFILE_MISSING", "Your account setup is incomplete. Please contact support.");
    }
    if (p.account_status !== "active") throw new ApiError(403, "SUSPENDED", "This account is suspended.");
    return { id: p.id, name: p.full_name, role: p.role as Role };
  }
  return null;
}