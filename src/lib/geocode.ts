// SERVER ONLY. Provider-neutral place search for the admin landmark picker.
// No provider is enabled by default. The owner opts in with env vars; no API key is needed for Nominatim,
// but its usage policy requires an identifying contact (GEOCODER_CONTACT) and light use. Swap in another provider
// (e.g. Mapbox, with a SERVER-side token) by implementing GeocodeProvider.
import { ApiError } from "@/lib/errors";
import { pointInPolygon, type Boundary } from "@/lib/fare";
import { distanceMeters } from "@/lib/map-plot";

export interface GeoCandidate { label: string; latitude: number; longitude: number }
export type GeocoderConfig = { provider: "none" } | { provider: "nominatim"; baseUrl: string; contact: string; viewbox: string | null; context: string };
type Env = Record<string, string | undefined>;

export function geocoderConfig(env: Env = process.env): GeocoderConfig {
  if ((env.GEOCODER_PROVIDER ?? "none").trim().toLowerCase() !== "nominatim") return { provider: "none" };
  const contact = (env.GEOCODER_CONTACT ?? "").trim();
  if (!contact) return { provider: "none" }; // refuse to run without the contact the provider's policy requires
  const base = (env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org").trim().replace(/\/+$/, "");
  try { if (!/^https:$/.test(new URL(base).protocol)) return { provider: "none" }; } catch { return { provider: "none" }; }
  return { provider: "nominatim", baseUrl: base, contact, viewbox: parseViewbox(env.GEOCODER_VIEWBOX), context: (env.GEOCODER_CONTEXT ?? "Babcock University, Ilishan-Remo").trim().slice(0, 80) };
}

/** Optional owner-supplied search box "lon1,lat1,lon2,lat2" (a rough campus rectangle). Never guessed by the app. */
export function parseViewbox(raw: string | undefined): string | null {
  if (!raw) return null;
  const n = raw.split(",").map((x) => Number(x.trim()));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [x1, y1, x2, y2] = n as [number, number, number, number];
  if (Math.abs(x1) > 180 || Math.abs(x2) > 180 || Math.abs(y1) > 90 || Math.abs(y2) > 90 || x1 === x2 || y1 === y2) return null;
  return n.join(",");
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

async function queryProvider(cfg: Extract<GeocoderConfig, { provider: "nominatim" }>, q: string, bounded: boolean, fetchImpl: typeof fetch): Promise<GeoCandidate[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "6", countrycodes: "ng" });
  if (cfg.viewbox) { params.set("viewbox", cfg.viewbox); if (bounded) params.set("bounded", "1"); }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/search?${params}`, { signal: ctl.signal, headers: { "User-Agent": `BabRide/1.0 (${cfg.contact})`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return parseNominatim(await res.json());
  } finally { clearTimeout(timer); }
}

export interface CampusScope { boundary: Boundary; anchors: { latitude: number; longitude: number }[]; maxMeters: number }
/**
 * Campus-only filter. With a real polygon: inside it. Without one: within maxMeters of a landmark that is already located.
 * With neither (a brand-new install) nothing is known yet, so only the campus-first query and the optional viewbox apply.
 */
export function insideCampusScope(c: { latitude: number; longitude: number }, scope?: CampusScope): boolean {
  if (!scope) return true;
  if (scope.boundary) return pointInPolygon(c, scope.boundary);
  if (scope.anchors.length) return scope.anchors.some((a) => distanceMeters({ lat: a.latitude, lng: a.longitude }, { lat: c.latitude, lng: c.longitude }) <= scope.maxMeters);
  return true;
}

/** Campus-first search: (1) the name with the campus as context, (2) inside the owner's viewbox if set, (3) plain, as a last resort.
 *  Results outside the campus scope are dropped (and counted) so an unrelated place can never be picked. */
export async function searchPlacesDetailed(q: string, env: Env = process.env, fetchImpl: typeof fetch = fetch, scope?: CampusScope): Promise<{ candidates: GeoCandidate[]; filteredOut: number }> {
  const cfg = geocoderConfig(env);
  if (cfg.provider === "none")
    throw new ApiError(503, "GEOCODER_NOT_CONFIGURED", "Place search isn't set up on this server. You can still use your current GPS position.");
  try {
    const attempts: [string, boolean][] = [[`${q}, ${cfg.context}`, false]];
    if (cfg.viewbox) attempts.push([q, true]);
    attempts.push([q, false]);
    const seen = new Set<string>(); const out: GeoCandidate[] = []; let filteredOut = 0;
    for (const [query, bounded] of attempts) {
      for (const c of await queryProvider(cfg, query, bounded, fetchImpl)) {
        const k = `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`;
        if (seen.has(k)) continue; seen.add(k);
        if (insideCampusScope(c, scope)) out.push(c); else filteredOut++;
      }
      if (out.length >= 3) break; // enough campus results: spare the provider
    }
    return { candidates: out.slice(0, 6), filteredOut };
  } catch {
    throw new ApiError(502, "GEOCODER_FAILED", "Place search is unavailable right now. Try again, or use your current GPS position.");
  }
}
export async function searchPlaces(q: string, env: Env = process.env, fetchImpl: typeof fetch = fetch, scope?: CampusScope): Promise<GeoCandidate[]> {
  return (await searchPlacesDetailed(q, env, fetchImpl, scope)).candidates;
}
