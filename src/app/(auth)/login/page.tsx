"use client";
import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";

export default function Login() {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Sign in
      </p>
      <AuthPanel
        initialView="signin"
        switchHrefs={{ signin: "/login", signup: "/signup" }}
        intro="Book campus tricycle rides for a fixed ₦200."
        footer={<p>Give rides on campus? <Link href="/rider/login" className="font-semibold text-white underline underline-offset-2">Rider sign-in</Link> · <Link href="/rider/join" className="font-semibold text-white underline underline-offset-2">Join as a rider</Link></p>}
      />
    </div>
  );
}
