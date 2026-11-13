/**
 * The Lobby: free practice against the Deputy, in three levels. No wallet, no
 * money, no signatures. Cracking a level earns a keycard on the feed and
 * unlocks the next. Levels are chosen client-side; the server only cares that
 * the level exists and that a run stays on the level it started on.
 */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { runExchange } from "@/lib/exchange";
import { addToFeed, getRecord, saveRecord, toPublic, type AttemptRecord } from "@/lib/feed";
import { assertDurable, chargeLobby } from "@/lib/limits";
import { LOBBY_LEVELS, lobbyLevel } from "@/lib/prompts";
import { cmd } from "@/lib/store";
import { clientIp, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.number().int().positive().optional(),
  token: z.string().max(100).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  level: z.number().int().min(1).max(LOBBY_LEVELS.length).optional(),
  message: z.string().trim().min(1).max(600),
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  const lock = { key: "" };
  try {
    assertDurable();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Send a message up to 600 characters.", code: "BAD_REQUEST" }, { status: 400 });
    const { id, token, name, message, level } = parsed.data;
    const c = config();

    let rec: AttemptRecord | null = null;
    let newToken: string | undefined;
    if (id) {
      rec = await getRecord(`l:${id}`);
      if (!rec || !token || sha(token) !== rec.sessionHash) throw new Error("SESSION: start a new practice run");
    } else {
      const newId = Number(await cmd<number>(["INCR", "lobby:next"]));
      newToken = randomBytes(24).toString("base64url");
      const lv = lobbyLevel(level ?? 1);
      rec = {
        key: `l:${newId}`, kind: "lobby", id: newId, vaultId: null, vaultName: `Lobby, level ${lv.level}`, guardianName: lv.name,
        player: name || "guest", round: lv.level, level: lv.level, startedAt: Date.now(), turns: [], integrity: 100, minIntegrity: 100,
        status: "live", intel: [], intelUsed: [], sessionHash: sha(newToken),
      };
    }
    const deputy = lobbyLevel(rec.level ?? 1);
    const maxTurns = deputy.turns || c.lobbyTurns;
    if (rec.status !== "live") throw new Error("CLOSED: this practice run is over");
    const userTurns = rec.turns.filter((t) => t.role === "user").length;
    if (userTurns >= maxTurns) throw new Error("OUT_OF_TURNS: start a new practice run");

    lock.key = `lock:${rec.key}`;
    if ((await cmd(["SET", lock.key, "1", "NX", "EX", 40])) === null) throw new Error("BUSY: the Deputy is still answering");

    await chargeLobby(clientIp(req));
    const reply = await runExchange(rec, { prompt: deputy.prompt, intel: deputy.intel }, message, { allowScripted: true, model: c.lobbyModel || undefined });
    if (reply.released) {
      rec.status = "released";
      rec.reason = reply.reason;
    } else if (userTurns + 1 >= maxTurns) {
      rec.status = "refused";
    }
    await saveRecord(rec);
    if (newToken) await addToFeed(rec);

    return NextResponse.json({
      id: rec.id,
      token: newToken,
      reply: reply.reply,
      integrity: reply.resolve,
      released: reply.released,
      verdict: reply.verdict,
      newIntel: reply.newIntel,
      level: deputy.level,
      turnsLeft: maxTurns - (userTurns + 1),
      record: toPublic(rec),
    });
  } catch (e) {
    return fail(e);
  } finally {
    if (lock.key) await cmd(["DEL", lock.key]).catch(() => {});
  }
}
