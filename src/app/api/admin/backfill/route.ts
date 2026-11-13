import { NextResponse } from "next/server";
import { cmd } from "@/lib/store";
import { getRecord, saveRecord } from "@/lib/feed";
import { classifyTranscript } from "@/lib/judge";
import { LOBBY_LEVELS, PROMPTS } from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tag attempts played before tactics existed. Operator only (ADMIN_TOKEN).
 * Processes up to `limit` untagged records from `start` in the global feed
 * and returns where to continue. Only adds `tactic` to player turns; never
 * changes text, scores or outcomes.
 */
export async function POST(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not allowed.", code: "FORBIDDEN" }, { status: 403 });
  }
  const p = new URL(req.url).searchParams;
  const start = Math.max(0, Number(p.get("start") ?? 0) || 0);
  const limit = Math.min(20, Math.max(1, Number(p.get("limit") ?? 10) || 10));
  const keys = [...new Set(await cmd<string[]>(["LRANGE", "feed", 0, 499]))];
  const intel = [...LOBBY_LEVELS, ...PROMPTS.teller, ...PROMPTS.gold].flatMap((v) => v.intel);
  let tagged = 0;
  let i = start;
  for (; i < keys.length && tagged < limit; i++) {
    const r = await getRecord(keys[i]);
    if (!r || !r.turns.some((t) => t.role === "user" && !t.tactic)) continue;
    const tactics = await classifyTranscript(r.turns, intel);
    let k = 0; // index over every player turn, tagged or not, so labels stay aligned
    r.turns = r.turns.map((t) => {
      if (t.role !== "user") return t;
      const label = tactics[k++];
      return { ...t, tactic: t.tactic ?? label };
    });
    await saveRecord(r);
    tagged++;
  }
  return NextResponse.json({ tagged, next: i < keys.length ? i : null, total: keys.length });
}
