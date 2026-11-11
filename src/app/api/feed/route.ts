import { NextResponse } from "next/server";
import { leaderboard, readFeed } from "@/lib/feed";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const f = new URL(req.url).searchParams.get("floor");
    const floor = f === "lobby" ? "lobby" : f && /^\d+$/.test(f) ? Number(f) : undefined;
    const feed = await readFeed(100, floor);
    return NextResponse.json({ feed, ...leaderboard(feed) });
  } catch (e) {
    return fail(e);
  }
}
