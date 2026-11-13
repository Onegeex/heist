import { NextResponse } from "next/server";
import { z } from "zod";
import { cmd } from "@/lib/store";
import { getRecord } from "@/lib/feed";

export const dynamic = "force-dynamic";

const Body = z.object({ players: z.array(z.string().min(1).max(64)).min(1).max(50) });

/**
 * Operator only (ADMIN_TOKEN): take test traffic out of the public feeds, so
 * the library and reports count real play. Records stay in the store; they
 * just stop being listed. Only feed lists change.
 */
export async function POST(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not allowed.", code: "FORBIDDEN" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send players: string[].", code: "BAD_REQUEST" }, { status: 400 });
  const who = new Set(parsed.data.players);
  const lists = ["feed", "feed:lobby", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `feed:v${n}`)];
  const removed: string[] = [];
  for (const list of lists) {
    const keys = [...new Set(await cmd<string[]>(["LRANGE", list, 0, 499]))];
    for (const k of keys) {
      const r = await getRecord(k);
      if (r && who.has(r.player)) {
        await cmd(["LREM", list, 0, k]);
        if (!removed.includes(k)) removed.push(k);
      }
    }
  }
  return NextResponse.json({ removed });
}
