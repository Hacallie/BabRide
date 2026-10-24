// Pure helpers for the admin location picker. No network, no secrets.
export type Dir = "north" | "south" | "east" | "west";
const M_PER_DEG_LAT = 111_320;

export const isPlaceholderPoint = (lat: number, lon: number): boolean => Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001;
export const validPoint = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !isPlaceholderPoint(lat, lon);

/** Moves a point by a few metres so an admin can fine-tune the pin after a search or GPS fix. */
export function nudge(lat: number, lon: number, dir: Dir, meters = 10): { latitude: number; longitude: number } {
  const dLat = meters / M_PER_DEG_LAT;
  const dLon = meters / (M_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  if (dir === "north") return { latitude: round(lat + dLat), longitude: lon };
  if (dir === "south") return { latitude: round(lat - dLat), longitude: lon };
  if (dir === "east") return { latitude: lat, longitude: round(lon + dLon) };
  return { latitude: lat, longitude: round(lon - dLon) };
}

/** OpenStreetMap embed (no API key). Shows a marker; it is a preview, not a click-to-place map. */
export function osmEmbedUrl(lat: number, lon: number, span = 0.003): string {
  const b = [lon - span, lat - span, lon + span, lat + span].map((n) => n.toFixed(6)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${b}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}
export const osmLargeUrl = (lat: number, lon: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`;

export type LocStatusKey = "placeholder" | "selected" | "verified";
export const STATUS_TEXT: Record<LocStatusKey, string> = {
  placeholder: "Not located yet", selected: "Location selected (not ground verified)", verified: "Ground verified",
};