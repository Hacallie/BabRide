// SERVER ONLY. Validates required environment variables.
// Reports variable NAMES and generic reasons only. It never includes a value in its output.
type Kind = "url" | "secret" | "posint";
interface Spec { name: string; kind: Kind; required: "always" | "production" | "never" }

const SPECS: Spec[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", kind: "url", required: "always" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", kind: "secret", required: "always" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", kind: "secret", required: "always" },
  { name: "NEXT_PUBLIC_APP_URL", kind: "url", required: "production" },
  { name: "BABRIDE_SEARCH_TIMEOUT_MIN", kind: "posint", required: "never" },
  { name: "BABRIDE_MAX_PASSENGERS", kind: "posint", required: "never" },
];

export type EnvSource = Record<string, string | undefined>;
export interface EnvReport {
  ok: boolean;
  missing: string[];
  invalid: { name: string; reason: string }[];
  forbidden: string[]; // secrets wrongly exposed through a NEXT_PUBLIC_ name
}

const looksPlaceholder = (v: string) => /^your-/i.test(v) || /xxx/i.test(v) || /change-?me/i.test(v) || /^<.*>$/.test(v);

function check(spec: Spec, v: string, production: boolean): string | null {
  if (looksPlaceholder(v)) return "still a placeholder";
  if (spec.kind === "url") {
    let u: URL;
    try { u = new URL(v); } catch { return "not a valid URL"; }
    if (!/^https?:$/.test(u.protocol)) return "must start with http:// or https://";
    if (production && spec.name === "NEXT_PUBLIC_APP_URL" && u.protocol !== "https:") return "must use https in production";
  }
  if (spec.kind === "secret" && v.length < 20) return "too short to be a real key";
  if (spec.kind === "posint" && !(Number.isInteger(Number(v)) && Number(v) > 0)) return "must be a positive whole number";
  return null;
}

export function validateEnv(env: EnvSource = process.env): EnvReport {
  const production = env.NODE_ENV === "production";
  const missing: string[] = []; const invalid: EnvReport["invalid"] = [];
  for (const s of SPECS) {
    const v = env[s.name]?.trim();
    if (!v) { if (s.required === "always" || (s.required === "production" && production)) missing.push(s.name); continue; }
    const why = check(s, v, production);
    if (why) invalid.push({ name: s.name, reason: why });
  }
  // The service-role key must never be readable by the browser.
  const forbidden = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SECRET/i.test(k) && !!env[k]);
  const a = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, r = env.SUPABASE_SERVICE_ROLE_KEY;
  if (a && r && a === r) invalid.push({ name: "SUPABASE_SERVICE_ROLE_KEY", reason: "must differ from the anon key" });
  return { ok: !missing.length && !invalid.length && !forbidden.length, missing, invalid, forbidden };
}

export function formatEnvReport(r: EnvReport): string {
  if (r.ok) return "Bab Ride environment: OK";
  const lines = ["Bab Ride is NOT configured correctly:"];
  if (r.missing.length) lines.push(`  missing: ${r.missing.join(", ")}`);
  for (const i of r.invalid) lines.push(`  invalid: ${i.name} (${i.reason})`);
  if (r.forbidden.length) lines.push(`  must not be public: ${r.forbidden.join(", ")}`);
  lines.push("  See .env.example and the README. Values are never printed.");
  return lines.join("\n");
}
