import { NextResponse } from "next/server";
import { readFeed } from "@/lib/feed";
import { breaksOf, filterFeed, movesOf, summary, tacticStats, type FloorFilter } from "@/lib/library";
import { TACTICS } from "@/lib/tactics";

export const dynamic = "force-dynamic";

/**
 * The attack library as open data. Every player message sent to every
 * guardian, tagged by tactic, with the judge's pressure score, the resolve it
 * cost, and whether it opened the door.
 *
 * ?floor=all|paid|lobby|v<id>   default all
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("floor") ?? "all";
  const f: FloorFilter = q === "paid" || q === "lobby" ? q : /^v\d+$/.test(q) ? { vaultId: Number(q.slice(1)) } : "all";
  const feed = filterFeed(await readFeed(500).catch(() => []), f);
  const moves = movesOf(feed);
  return NextResponse.json(
    {
      about: "Heist attack library: player messages to AI guardians that hold NEAR, tagged by tactic. https://heist-vault-game.vercel.app/library",
      taxonomy: TACTICS,
      summary: summary(feed, moves),
      tactics: tacticStats(moves).map(({ best, ...s }) => ({ ...s, bestKey: best?.key ?? null })),
      breaks: breaksOf(feed, moves).map(({ key, floor, tactic, text, at, payoutYocto, payoutTx, attemptTurns }) => ({ key, floor, tactic, text, at, payoutYocto, payoutTx, attemptTurns })),
      moves: moves.map(({ key, floor, kind, level, at, text, tactic, tagged, pressure, drop, resolveAfter, decisive, outcome }) => ({ key, floor, kind, level, at, text, tactic, tagged, pressure, drop, resolveAfter, decisive, outcome })),
    },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}
