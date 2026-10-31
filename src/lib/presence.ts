// Pure presence helper. A rider is "effectively online" only while is_online is set AND they were seen recently.
// This is what takes a rider offline safely when a tab is closed, the phone dies or the session expires, without a background worker.
export function isFresh(lastSeenAt: string | null | undefined, ttlSec: number, nowMs: number = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && nowMs - t <= ttlSec * 1000 && t <= nowMs + 60_000;
}
export const effectiveOnline = (isOnline: boolean, lastSeenAt: string | null | undefined, ttlSec: number, nowMs?: number): boolean =>
  isOnline && isFresh(lastSeenAt, ttlSec, nowMs);
