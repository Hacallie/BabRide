import { NextResponse } from "next/server";
import { appMode } from "@/lib/config";
import { validateEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() {
  const mode = appMode();
  // Variable NAMES help local setup; never reveal them (or values) in production.
  const r = mode === "unconfigured" && process.env.NODE_ENV !== "production" ? validateEnv() : null;
  return NextResponse.json({
    mode, electronicPayments: false,
    ...(r ? { missing: r.missing, invalid: r.invalid.map((i) => i.name) } : {}),
  });
}
