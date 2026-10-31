// Browser-side session helpers: rider auto-online after sign-in, and a clean sign-out.
import { api, ClientApiError } from "@/lib/client-api";
import { browserSupabase } from "@/lib/supabase-browser";

/** Set when the automatic "go online" after sign-in failed, so the rider page retries once it opens. */
export const AUTO_ONLINE_PENDING = "babride:autoOnlinePending";
/** Broadcast so the header's availability pill follows the rider page. detail = boolean online. */
export const RIDER_STATUS_EVENT = "babride:rider-status";
export interface StartResult { online: boolean; reason: string | null }

const flag = (on: boolean) => { try { on ? sessionStorage.setItem(AUTO_ONLINE_PENDING, "1") : sessionStorage.removeItem(AUTO_ONLINE_PENDING); } catch { /* storage unavailable */ } };
export const autoOnlinePending = (): boolean => { try { return sessionStorage.getItem(AUTO_ONLINE_PENDING) === "1"; } catch { return false; } };

/** Persists "online" on the server right after a rider signs in. Never throws: sign-in must succeed even if this fails.
 *  One retry on a network/server failure; a definite refusal (not a rider, not eligible) is not retried. */
export async function startRiderSession(): Promise<StartResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await api<StartResult>("/api/v1/rider/session/start", { method: "POST", timeoutMs: 8000 });
      flag(false);
      window.dispatchEvent(new CustomEvent(RIDER_STATUS_EVENT, { detail: r.online }));
      return r;
    } catch (e) {
      if (e instanceof ClientApiError && (e.status === 401 || e.status === 403)) { flag(false); return null; }
    }
  }
  flag(true); // retried by the rider page
  return null;
}

/** Takes a rider offline (best effort), signs out of Supabase and leaves for the sign-in page. */
export async function signOutAndLeave(isRider: boolean): Promise<void> {
  if (isRider) { try { await api("/api/v1/rider/session/end", { method: "POST", timeoutMs: 4000 }); } catch { /* the heartbeat expiry covers this */ } }
  try { await browserSupabase()?.auth.signOut(); } catch { /* we leave either way */ }
  flag(false);
  window.location.assign("/login");
}
