// CLIENT. Tells the server a rider just signed in so it can set them online (if approved). Never blocks sign-in.
import { api } from "@/lib/client-api";

export type RiderStart = { online: true } | { online: false; reason: "NOT_APPROVED" | "INCOMPLETE_PROFILE" | "SUSPENDED" } | { online: false; reason: "FAILED" };

export async function startRiderSession(): Promise<RiderStart> {
  try { return await api<RiderStart>("/api/v1/rider/session", { method: "POST", body: { action: "start" }, timeoutMs: 8000 }); }
  catch { return { online: false, reason: "FAILED" }; } // the rider can still tap "Go online"
}
