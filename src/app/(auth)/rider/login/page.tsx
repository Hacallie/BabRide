"use client";
import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";

export default function RiderLogin() {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Rider sign-in
      </p>
      <AuthPanel
        initialView="signin"
        heading="Rider sign-in"
        next="/rider"
        nextByRole={{ rider: "/rider", student: "/rider/join" }}
        intro="Approved riders go online from the rider page. If you haven't applied yet, you'll be taken to the application."
        footer={<p>New rider? <Link href="/rider/join" className="font-semibold text-white underline underline-offset-2">Join as a rider</Link> · Just want to book? <Link href="/login" className="font-semibold text-white underline underline-offset-2">Student sign-in</Link></p>}
      />
    </div>
  );
}
