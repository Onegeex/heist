import { NextResponse } from "next/server";
import { LimitError } from "./limits";

export const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function fail(e: unknown) {
  if (e instanceof LimitError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  const msg = e instanceof Error ? e.message : "error";
  const code = msg.match(/^([A-Z_]{3,})/)?.[1] ?? "ERROR";
  const status = code === "GUARDIAN_OFFLINE" ? 503 : code === "ERROR" ? 500 : 400;
  if (status === 500) console.error("[heist]", e);
  return NextResponse.json({ error: status === 500 ? "Something went wrong on the server." : msg, code }, { status });
}
