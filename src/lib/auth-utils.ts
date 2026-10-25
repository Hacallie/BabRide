import type { Role } from "@/lib/types";

/** sessionStorage key holding the page to open after sign-in (kept out of the redirect URL on purpose). */
export const NEXT_KEY = "babride:next";

const ALLOWED_NEXT = ["/student", "/rider", "/rider/join", "/admin"];

/** Only same-site paths from a fixed allow-list. Anything else (absolute URLs, //host, backslashes) is dropped. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = raw; // not trimmed: stray whitespace or control characters mean "reject"
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || /[\u0000-\u001f]/.test(p)) return null;
  const path = p.split(/[?#]/)[0];
if (path === undefined) return null;
  return ALLOWED_NEXT.includes(path) ? path : null;
}

export const homeFor = (role: Role): string => (role === "admin" ? "/admin" : role === "rider" ? "/rider" : "/student");
/** Which pages each role may open. A requested page the role cannot use is ignored (student -> student area, rider -> rider area). */
export function canOpen(role: Role, path: string): boolean {
  if (path === "/student") return role === "student";
  if (path === "/rider") return role === "rider";
  if (path === "/rider/join") return role === "student" || role === "rider";
  if (path === "/admin") return role === "admin";
  return false;
}
export const destinationFor = (role: Role, next: string | null | undefined): string => {
  const n = safeNext(next);
  return n && canOpen(role, n) ? n : homeFor(role);
};

/** Fixed callback path (no query string) so the Supabase redirect allow-list entry is exact. */
export const callbackUrl = (origin: string): string => `${origin}/auth/callback`;

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Email + password rules shown before we call the provider. (Supabase also enforces its own minimum.) */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 72) return "Use 72 characters or fewer.";
  return null;
}
export function nameProblem(raw: string): string | null {
  const n = raw.trim();
  return n.length < 2 ? "Enter your full name." : n.length > 80 ? "That name is too long." : null;
}

/** Friendly, non-leaky messages. Never shows raw provider text. */
export function describeAuthError(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; status?: number };
  const msg = (e.message ?? "").toLowerCase();
  const code = (e.code ?? "").toLowerCase();
  if (code === "invalid_credentials" || /invalid login credentials/.test(msg)) return "Incorrect email or password.";
  if (code === "email_not_confirmed" || /email not confirmed/.test(msg)) return "Please confirm your email first. Check your inbox (and spam) for our message, then sign in.";
  if (code === "user_already_exists" || /already registered|already exists/.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (code === "weak_password" || /password.*(weak|short|least)/.test(msg)) return "Choose a stronger password (at least 8 characters).";
  if (/rate_limit/.test(code) || e.status === 429 || /rate limit|too many|only request this after/.test(msg))
    return "Too many attempts. Please wait a minute and try again.";
  if (/provider is not enabled|unsupported provider/.test(msg)) return "Google sign-in isn't enabled yet.";
  if (code === "email_provider_disabled" || /signups not allowed|email.*disabled/.test(msg)) return "Email sign-up is currently disabled.";
  if (/error sending|smtp|unexpected_failure/.test(msg + " " + code) || e.status === 500)
    return "We couldn't send the confirmation email. Email delivery may not be set up yet. Please try again later.";
  if (/failed to fetch|network/.test(msg)) return "No connection. Check your internet and try again.";
  return "Something went wrong. Please try again.";
}

/** Keys passed from /auth/callback to /login as ?e=KEY. Fixed texts only; URL text is never displayed. */
export const LOGIN_ERROR_TEXT: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That link has expired or was already used. Sign in with your email and password, or try Google again.",
  failed: "Sign-in could not be completed. Please try again.",
  wrongbrowser: "Open the confirmation link in the same browser you signed up with, or sign in with your email and password.",
  config: "Sign-in is unavailable because this server isn't configured.",
};

/** Reads a NEXT_PUBLIC on/off flag. Tolerates case, spaces and 1/yes (e.g. Windows editors). Anything else is off. */
export const flagOn = (v: string | undefined): boolean => ["true", "1", "yes"].includes((v ?? "").trim().toLowerCase());

/**
 * Message for "the browser says you're signed in, but our server call failed".
 * In development the 401 hint names the likely configuration causes (names only, never values).
 */
export function describeSessionProblem(err: unknown, dev = process.env.NODE_ENV !== "production"): string {
  const e = (err ?? {}) as { status?: number; message?: string };
  if (e.status === 401)
    return dev
      ? "Signed in with Supabase, but the server rejected the session. Check that SUPABASE_SERVICE_ROLE_KEY belongs to the same project as NEXT_PUBLIC_SUPABASE_URL, then restart the dev server."
      : "We couldn't verify your sign-in with the server. Please try again.";
  if (e.status === 403 || e.status === 503) return e.message || "Your account could not be loaded.";
  return "Your account could not be loaded. Please try again.";
}