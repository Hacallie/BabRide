// SERVER ONLY. Provider-neutral place search for the admin landmark picker.
// No provider is enabled by default. The owner opts in with env vars; no API key is needed for Nominatim,
// but its usage policy requires an identifying contact (GEOCODER_CONTACT) and light use. Swap in another provider
// (e.g. Mapbox, with a SERVER-side token) by implementing GeocodeProvider.
import { ApiError } from "@/lib/errors";

export interface GeoCandidate { label: string; latitude: number; longitude: number }
export type GeocoderConfig = { provider: "none" } | { provider: "nominatim"; baseUrl: string; contact: string };
type Env = Record<string, string | undefined>;

export function geocoderConfig(env: Env = process.env): GeocoderConfig {
  if ((env.GEOCODER_PROVIDER ?? "none").trim().toLowerCase() !== "nominatim") return { provider: "none" };
  const contact = (env.GEOCODER_CONTACT ?? "").trim();
  if (!contact) return { provider: "none" }; // refuse to run without the contact the provider's policy requires
  const base = (env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org").trim().replace(/\/+$/, "");
  try { if (!/^https:$/.test(new URL(base).protocol)) return { provider: "none" }; } catch { return { provider: "none" }; }
  return { provider: "nominatim", baseUrl: base, contact };
}

/** Defensive parse: keeps only well-formed numeric results and caps the list. */
export function parseNominatim(json: unknown): GeoCandidate[] {
  if (!Array.isArray(json)) return [];
  const out: GeoCandidate[] = [];
  for (const r of json as Array<Record<string, unknown>>) {
    const latitude = Number(r?.lat), longitude = Number(r?.lon);
    const label = typeof r?.display_name === "string" ? r.display_name.slice(0, 160) : "";
    if (label && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)
      out.push({ label, latitude, longitude });
    if (out.length >= 6) break;
  }
  return out;
}

export async function searchPlaces(q: string, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<GeoCandidate[]> {
  const cfg = geocoderConfig(env);
  if (cfg.provider === "none")
    throw new ApiError(503, "GEOCODER_NOT_CONFIGURED", "Place search isn't set up on this server. You can still use your current GPS position.");
  const url = `${cfg.baseUrl}/search?${new URLSearchParams({ q, format: "jsonv2", limit: "6", countrycodes: "ng" })}`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { "User-Agent": `BabRide/1.0 (${cfg.contact})`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return parseNominatim(await res.json());
  } catch {
    throw new ApiError(502, "GEOCODER_FAILED", "Place search is unavailable right now. Try again, or use your current GPS position.");
  } finally { clearTimeout(timer); }
}
