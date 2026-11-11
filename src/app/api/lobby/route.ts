/**
 * The Lobby: free practice against the Deputy. No wallet, no money, no
 * signatures. Cracking it earns a keycard (bragging rights on the feed).
 */
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { askGuardian } from "@/lib/guardian";
import { addToFeed, getRecord, saveRecord, toPublic, type AttemptRecord } from "@/lib/feed";
import { assertDurable, chargeLobby } from "@/lib/limits";
import { currentPrompt } from "@/lib/prompts";
import { cmd } from "@/lib/store";
import { clientIp, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.number().int().positive().optional(),
  token: z.string().max(100).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  message: z.string().trim().min(1).max(600),
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  const lock = { key: "" };
  try {
    assertDurable();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Send a message up to 600 characters.", code: "BAD_REQUEST" }, { status: 400 });
    const { id, token, name, message } = parsed.data;
    const c = config();
    const deputy = currentPrompt("lobby");

    let rec: AttemptRecord | null = null;
    let newToken: string | undefined;
    if (id) {
      rec = await getRecord(`l:${id}`);
      if (!rec || !token || sha(token) !== rec.sessionHash) throw new Error("SESSION: start a new practice run");
    } else {
      const newId = Number(await cmd<number>(["INCR", "lobby:next"]));
      newToken = randomBytes(24).toString("base64url");
      rec = {
        key: `l:${newId}`, kind: "lobby", id: newId, vaultId: null, vaultName: "The Lobby", guardianName: deputy.name,
        player: name || "guest", round: 1, startedAt: Date.now(), turns: [], integrity: 100, minIntegrity: 100,
        status: "live", sessionHash: sha(newToken),
      };
    }
    if (rec.status !== "live") throw new Error("CLOSED: this practice run is over");
    const userTurns = rec.turns.filter((t) => t.role === "user").length;
    if (userTurns >= c.lobbyTurns) throw new Error("OUT_OF_TURNS: start a new practice run");

    lock.key = `lock:${rec.key}`;
    if ((await cmd(["SET", lock.key, "1", "NX", "EX", 40])) === null) throw new Error("BUSY: the Deputy is still answering");

    await chargeLobby(clientIp(req));
    const history = [...rec.turns.map(({ role, text }) => ({ role, text })), { role: "user" as const, text: message }];
    const reply = await askGuardian(deputy.prompt, history, { allowScripted: true, model: c.lobbyModel || undefined });

    rec.turns.push({ role: "user", text: message }, { role: "assistant", text: reply.text, integrity: reply.integrity });
    rec.integrity = reply.integrity;
    rec.minIntegrity = Math.min(rec.minIntegrity, reply.integrity);
    rec.model = reply.model;
    if (reply.released) {
      rec.status = "released";
      rec.reason = reply.reason;
    } else if (userTurns + 1 >= c.lobbyTurns) {
      rec.status = "refused";
    }
    await saveRecord(rec);
    if (newToken) await addToFeed(rec);

    return NextResponse.json({
      id: rec.id,
      token: newToken,
      reply: reply.text,
      integrity: reply.integrity,
      released: reply.released,
      turnsLeft: c.lobbyTurns - (userTurns + 1),
      record: toPublic(rec),
    });
  } catch (e) {
    return fail(e);
  } finally {
    if (lock.key) await cmd(["DEL", lock.key]).catch(() => {});
  }
}
