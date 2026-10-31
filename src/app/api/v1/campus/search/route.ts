import { handle, parse } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { searchCampusLandmarks } from "@/lib/service";
import { campusSearchSchema } from "@/lib/schemas";
export const dynamic = "force-dynamic";
// PUBLIC campus-only search: matches landmark names from the campus's own landmark table, so results can never be off campus.
export const GET = handle(async (req) => {
  const sp = new URL(req.url).searchParams;
  const { q, purpose } = parse(campusSearchSchema, { q: sp.get("q") ?? "", purpose: sp.get("purpose") ?? undefined });
  return { results: await searchCampusLandmarks(await getRepo(), q, purpose) };
});
