// CLIENT. One sign-out for the whole app. A rider is set OFFLINE on the server first (while the session still works),
// then the browser session is cleared. If the server call fails we still sign out; the heartbeat then lapses by itself.
import { api } from "@/lib/client-api";
import { browserSupabase } from "@/lib/supabase-browser";
import type { Role } from "@/lib/types";

export async function signOutEverywhere(role?: Role): Promise<void> {
  if (role === "rider") { try { await api("/api/v1/rider/session", { method: "POST", body: { action: "end" }, timeoutMs: 4000 }); } catch { /* heartbeat expiry covers this */ } }
  try { await browserSupabase()?.auth.signOut(); } catch { /* we leave the page either way */ }
  window.location.assign("/login");
}
