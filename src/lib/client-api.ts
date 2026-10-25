import { browserSupabase } from "@/lib/supabase-browser";

export class ClientApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

/** Slow mobile networks are normal, but a request must never hang forever. */
export const REQUEST_TIMEOUT_MS = 20_000;

export async function api<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sb = browserSupabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init?.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(path, { method: init?.method ?? "GET", headers, signal: ctl.signal, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  } catch (e) {
    if (ctl.signal.aborted) throw new ClientApiError(0, "TIMEOUT", "This is taking too long. Check your connection and try again.");
    throw new ClientApiError(0, "NETWORK", "No connection. Check your network and try again.");
  } finally { clearTimeout(timer); }
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) throw new ClientApiError(res.status, json?.error?.code ?? "ERROR", json?.error?.message ?? "Something went wrong.");
  return json as T;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
