"use client";
import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";

export default function Login() {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Student sign-in
      </p>
      <AuthPanel
        heading="Sign in to Bab Ride"
        intro="Book campus tricycle rides for a fixed ₦200."
        footer={<>
          <p>New accounts are always students. Administrators approve riders.</p>
          <p className="mt-2">Give rides on campus? <Link href="/rider/login" className="font-semibold text-white underline underline-offset-2">Rider sign-in</Link> · <Link href="/rider/join" className="font-semibold text-white underline underline-offset-2">Join as a rider</Link></p>
        </>}
      />
    </div>
  );
}