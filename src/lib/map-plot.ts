// Pure helpers for the lightweight campus map. No network, no secrets, no tile provider.
export interface PlotPoint { id: string; lat: number; lng: number }
export interface Placed extends PlotPoint { x: number; y: number }

const R = 6_371_000;
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fits points into a width x height box (equirectangular, aspect preserved). A lone point is centred. */
export function project(points: PlotPoint[], width: number, height: number, pad = 28): Placed[] {
  if (points.length === 0) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lng * kx), ys = points.map((p) => -p.lat);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const MIN_SPAN = 0.0015; // ~170 m, so a single point (or two very close ones) is not "zoomed" to the edges
  if (maxX - minX < MIN_SPAN) { const c = (minX + maxX) / 2; minX = c - MIN_SPAN / 2; maxX = c + MIN_SPAN / 2; }
  if (maxY - minY < MIN_SPAN) { const c = (minY + maxY) / 2; minY = c - MIN_SPAN / 2; maxY = c + MIN_SPAN / 2; }
  const spanX = maxX - minX, spanY = maxY - minY;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2, offY = (height - spanY * scale) / 2;
  return points.map((p, i) => ({ ...p, x: offX + (xs[i]! - minX) * scale, y: offY + (ys[i]! - minY) * scale }));
}

export const formatDistance = (m: number): string => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
