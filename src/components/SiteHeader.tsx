"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Brand from "@/components/Brand";

const links = [
  { href: "/", label: "Home" },
  { href: "/#how", label: "How It Works" },
  { href: "/#campus", label: "Campus Locations" },
  { href: "/rider/join", label: "Become a Rider" },
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const item = "rounded-lg px-3 py-2 text-sm font-medium text-mist transition hover:bg-white/10 hover:text-white";
  const cta = "inline-flex min-h-[40px] items-center rounded-xl bg-royal px-4 text-sm font-semibold text-white transition hover:bg-[#1d4fc7] active:scale-[.98]";
  return (
    <header className="on-dark glass-nav sticky top-0 z-30">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => <Link key={l.href} href={l.href} className={item}>{l.label}</Link>)}
          <Link href="/#book" className={`${cta} ml-2`}>Book a Ride</Link>
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          <Link href="/#book" className={cta}>Book</Link>
          <button type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white hover:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="rise border-t border-white/10 px-4 pb-3 pt-2 lg:hidden">
          <ul className="grid">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="block rounded-lg px-3 py-3 text-base font-medium text-white hover:bg-white/10">{l.label}</Link></li>)}
          </ul>
        </nav>
      )}
    </header>
  );
}