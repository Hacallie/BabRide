// Pure navigation model so the rules are unit-testable. Links are limited to pages that exist today.
import type { Role, RiderInfo } from "@/lib/types";
export interface NavLink { href: string; label: string }

/** Marketing navigation: signed-out visitors only. */
export const PUBLIC_LINKS: NavLink[] = [
  { href: "/", label: "Home" }, { href: "/#how", label: "How It Works" }, { href: "/#campus", label: "Campus Locations" },
  { href: "/rider/join", label: "Become a Rider" }, { href: "/login", label: "Sign in" }, { href: "/signup", label: "Create account" },
];

/** Signed-in navigation for a role. Wallet and Profile pages are not built yet, so they are not linked (no dead links). */
export function authLinks(role: Role): NavLink[] {
  if (role === "admin") return [{ href: "/admin", label: "Admin dashboard" }];
  if (role === "rider") return [{ href: "/rider", label: "Dashboard" }, { href: "/rider#req", label: "Ride requests" }, { href: "/rider#rec", label: "Recent trips" }];
  return [{ href: "/student", label: "Book a Ride" }, { href: "/student#hist", label: "My Rides" }];
}
export const homeLink = (role: Role | null): string => (role === "admin" ? "/admin" : role === "rider" ? "/rider" : role === "student" ? "/student" : "/");
export const availabilityOf = (rider: RiderInfo | null | undefined): "online" | "offline" | null => (rider ? (rider.online ? "online" : "offline") : null);
