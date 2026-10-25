import { handle } from "@/lib/http";
import { getRepo } from "@/lib/repo";
export const dynamic = "force-dynamic";
// PUBLIC, read-only: active landmark names so the homepage booking panel can work before sign-in.
// Deliberately omits coordinates. Authenticated clients use /api/v1/campus/locations for those.
// Descriptions are included so similarly named places can be told apart.
export const GET = handle(async () => {
  const locs = await (await getRepo()).listLocations();
  return {
    landmarks: locs.map((l) => ({
      id: l.id, name: l.name, description: l.description, verified: l.verified, status: l.status, located: l.status !== "placeholder",
      pickupAllowed: l.pickupAllowed, destinationAllowed: l.destinationAllowed,
    })),
  };
});