import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { ApiError } from "@/lib/errors";

export interface Ctx { params: Record<string, string> }

export function handle(fn: (req: Request, ctx: Ctx) => Promise<unknown>, successStatus = 200) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out, { status: successStatus });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
      console.error("unhandled error", e instanceof Error ? e.message : "unknown");
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
    }
  };
}

// Input is `unknown` on purpose: schemas that coerce or preprocess (query strings) accept more than they output.
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(400, "INVALID_INPUT", r.error.issues[0]?.message ?? "Invalid request.");
  return r.data;
}

export async function jsonBody(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { throw new ApiError(400, "INVALID_JSON", "Request body must be JSON."); }
}
