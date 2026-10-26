// Which navigation a visitor sees. Pure, so it is testable, and it never decides what a user may DO:
// every API route and page re-checks the role on the server. Hidden links are convenience, not security.
import type { Role } from "@/lib/types";

export interface NavLink { href: string; label: string }
export type AuthView = { s: "loading" } | { s: "anon" } | { s: "auth"; role: Role; name: string };

export const PUBLIC_LINKS: NavLink[] = [
  { href: "/", label: "Home" }, { href: "/#how", label: "How It Works" }, { href: "/#campus", label: "Campus Locations" },
  { href: "/rider/join", label: "Become a Rider" }, { href: "/login", label: "Sign in" }, { href: "/signup", label: "Create account" },
];
const ROLE_LINKS: Record<Role, NavLink[]> = {
  student: [{ href: "/student", label: "Book a Ride" }, { href: "/student#history", label: "My Rides" }],
  rider: [{ href: "/rider", label: "Dashboard" }, { href: "/rider#requests", label: "Ride requests" }, { href: "/rider#trips", label: "My trips" }],
  admin: [{ href: "/admin", label: "Admin dashboard" }],
};
/** Links for the current view. While loading we return none, so neither menu flashes. */
export function navFor(v: AuthView): NavLink[] {
  if (v.s === "loading") return [];
  return v.s === "anon" ? PUBLIC_LINKS : ROLE_LINKS[v.role];
}
export const showsPublicMarketing = (v: AuthView) => v.s === "anon";
export const showsBookCta = (v: AuthView) => v.s === "anon" || (v.s === "auth" && v.role === "student");
