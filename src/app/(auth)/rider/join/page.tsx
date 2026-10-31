"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuthPanel from "@/components/auth/AuthPanel";
import type { Me } from "@/components/Gate";
import { btnAccent, btnGlass, glassPanel } from "@/components/ui";
import { api, ClientApiError } from "@/lib/client-api";

type State =
  | { s: "loading" }
  | { s: "anon" }
  | { s: "ready"; me: Me }
  | { s: "error"; msg: string };

export default function RiderJoin() {
  const [st, setSt] = useState<State>({ s: "loading" });

  const load = useCallback(async () => {
    try {
      const { mode } = await api<{ mode: string }>("/api/v1/mode");

      if (mode === "unconfigured") {
        setSt({ s: "error", msg: "Bab Ride is not configured on this server yet." });
        return;
      }

      let me: Me;

      try {
        me = await api<Me>("/api/v1/me");
      } catch (e) {
        if (e instanceof ClientApiError && e.status === 401) {
          setSt({ s: "anon" });
          return;
        }
        throw e;
      }

      if (me.actor.role === "student") {
        await api("/api/v1/rider/apply", {
          method: "POST",
          body: {},
        });

        me = await api<Me>("/api/v1/me");
      }

      setSt({ s: "ready", me });
    } catch (e) {
      setSt({
        s: "error",
        msg: e instanceof Error ? e.message : "Could not complete rider registration.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start lg:gap-12">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          For campus tricycle riders
        </p>

        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Join Bab Ride as a Rider
        </h1>

        <p className="mt-3 max-w-md text-lg leading-relaxed text-mist">
          Give rides around campus in your tricycle. Every ride has the same fixed fare, and you accept the requests you want.
        </p>

        <p className="mt-6 max-w-md text-sm text-mist">
          Create your account and become a rider automatically. Your rider page will be ready once registration is complete.
        </p>
      </div>

      <div>
        {st.s === "loading" && (
          <div className={glassPanel} role="status">
            <p className="text-mist">Loading...</p>
          </div>
        )}

        {st.s === "error" && (
          <section className={glassPanel} role="alert">
            <h2 className="text-xl font-bold">Registration unavailable</h2>
            <p className="mt-2 text-mist">{st.msg}</p>
            <button onClick={() => void load()} className={`${btnAccent} mt-5 w-full`}>
              Try again
            </button>
          </section>
        )}

        {st.s === "anon" && (
          <AuthPanel
            as="h2"
            initialView="signup"
            heading="Create your rider account"
            next="/rider/join"
            onSignedIn={load}
            intro="Create an account to register as a Bab Ride rider."
            accountNote="Your account will be registered as a rider."
            footer={
              <>
                Already registered?{" "}
                <Link href="/rider/login" className="font-semibold text-white underline underline-offset-2">
                  Rider sign-in
                </Link>
                {" "}· Just want to book rides?{" "}
                <Link href="/login" className="font-semibold text-white underline underline-offset-2">
                  Student sign-in
                </Link>
              </>
            }
          />
        )}

        {st.s === "ready" && (
          <section className={glassPanel} aria-live="polite">
            {st.me.actor.role === "rider" ? (
              <>
                <h2 className="text-xl font-bold">Rider account ready</h2>

                {st.me.rider?.vehicle && (
                  <p className="mt-3 text-sm text-mist">
                    Passenger seats:{" "}
                    <b className="text-white">{st.me.rider.vehicle.capacity}</b>
                  </p>
                )}

                <p className="mt-3 text-mist">
                  Your rider account has been registered. You can continue to your rider page.
                </p>

                <Link href="/rider" className={`${btnAccent} mt-5 w-full`}>
                  Open rider page
                </Link>
              </>
            ) : st.me.actor.role === "admin" ? (
              <>
                <h2 className="text-xl font-bold">Administrator account</h2>
                <p className="mt-2 text-mist">
                  Administrator accounts cannot register as riders.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">Registration incomplete</h2>
                <p className="mt-2 text-mist">
                  Your account has not been promoted to rider yet.
                </p>
                <button onClick={() => void load()} className={`${btnGlass} mt-5 w-full`}>
                  Try again
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
