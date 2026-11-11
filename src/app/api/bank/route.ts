import { NextResponse } from "next/server";
import { bankSnapshot } from "@/lib/bank";
import { ACCOUNT_RE, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const account = new URL(req.url).searchParams.get("account");
    return NextResponse.json(await bankSnapshot(account && ACCOUNT_RE.test(account) ? account : null));
  } catch (e) {
    return fail(e);
  }
}
