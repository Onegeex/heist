import { NextResponse } from "next/server";
import { leaderboard, readFeed } from "@/lib/feed";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feed = await readFeed(100);
    return NextResponse.json({ feed, ...leaderboard(feed) });
  } catch (e) {
    return fail(e);
  }
}
