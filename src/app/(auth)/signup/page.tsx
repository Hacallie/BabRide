"use client";
import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";

export default function Signup() {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Create account
      </p>
      <AuthPanel
        initialView="signup"
        switchHrefs={{ signin: "/login", signup: "/signup" }}
        intro="One account to book rides. Administrators approve riders; nobody can make themselves a rider or admin."
        footer={<p>Want to give rides? <Link href="/rider/join" className="font-semibold text-white underline underline-offset-2">Join as a rider</Link></p>}
      />
    </div>
  );
}
