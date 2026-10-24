import { validateEnv } from "@/lib/env";

/** supabase: configured, real database. unconfigured: every data API refuses (HTTP 503). There is no demo mode. */
export type AppMode = "supabase" | "unconfigured";

export function appMode(): AppMode {
  return validateEnv().ok ? "supabase" : "unconfigured";
}

export const searchTimeoutMinutes = () => {
  const n = Number(process.env.BABRIDE_SEARCH_TIMEOUT_MIN ?? 10);
  return Number.isInteger(n) && n > 0 ? n : 10;
};
