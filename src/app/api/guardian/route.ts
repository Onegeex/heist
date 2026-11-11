import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config, moneyRoutesBlocked } from "@/lib/config";
import { demoGuardianSeed, getAttempt, getState, vaultName } from "@/lib/chain";
import { askGuardian } from "@/lib/guardian";
import { addToFeed, getRecord, saveRecord, toPublic, type AttemptRecord } from "@/lib/feed";
import { assertDurable, chargeMessage } from "@/lib/limits";
import { keyFromSeed, releaseMessage, signRelease } from "@/lib/release";
import { cmd } from "@/lib/store";
import { ACCOUNT_RE, clientIp, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  attemptId: z.number().int().positive(),
  account: z.string().min(2).max(64).regex(ACCOUNT_RE),
  message: z.string().trim().min(1).max(600),
  token: z.string().max(100).optional(),
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  const blocked = moneyRoutesBlocked();
  if (blocked) return NextResponse.json({ error: blocked, code: "MAINNET_DISABLED" }, { status: 403 });
  const lock = { key: "" };
  try {
    assertDurable();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Send attemptId, account and a message up to 600 characters.", code: "BAD_REQUEST" }, { status: 400 });
    const { attemptId, account, message, token } = parsed.data;
    const c = config();

    // 1. The attempt must be real, yours, open, current and fresh — checked against the vault.
    const [attempt, state] = await Promise.all([getAttempt(attemptId), getState()]);
    if (!attempt) throw new Error("NO_ATTEMPT: open an attempt first");
    if (attempt.player !== account) throw new Error("NOT_YOUR_ATTEMPT: this attempt belongs to another wallet");
    if (attempt.status !== "Open") throw new Error("USED: this attempt already won");
    if (attempt.round !== state.round) throw new Error("STALE_ROUND: someone cracked the vault before you. Open a new attempt.");
    if (state.paused) throw new Error("PAUSED: the vault is closed right now");
    if (Date.now() > attempt.openedAtMs + c.attemptTtlMs - 60_000) throw new Error("EXPIRED: this attempt's 30 minutes are up");

    // 2. One message at a time per attempt.
    lock.key = `lock:att:${attemptId}`;
    if ((await cmd(["SET", lock.key, "1", "NX", "EX", 40])) === null) throw new Error("BUSY: the guardian is still answering");

    // 3. The first message claims the chat; later ones need its token.
    let rec = await getRecord(attemptId);
    let newToken: string | undefined;
    if (!rec) {
      newToken = randomBytes(24).toString("base64url");
      rec = {
        id: attemptId, player: account, round: attempt.round, startedAt: Date.now(), turns: [],
        integrity: 100, minIntegrity: 100, status: "live", sessionHash: sha(newToken),
      } satisfies AttemptRecord;
    } else if (!token || sha(token) !== rec.sessionHash) {
      throw new Error("SESSION: this attempt's chat was opened in another browser");
    }
    if (rec.status !== "live") throw new Error("CLOSED: this attempt is over");
    const userTurns = rec.turns.filter((t) => t.role === "user").length;
    if (userTurns >= c.turnsPerAttempt) throw new Error("OUT_OF_TURNS: no messages left on this attempt");

    // 4. Spend limits, before any money goes to the model.
    await chargeMessage(account, clientIp(req));

    // 5. Ask the guardian with the server-held transcript.
    const history = [...rec.turns.map(({ role, text }) => ({ role, text })), { role: "user" as const, text: message }];
    const reply = await askGuardian(history);

    rec.turns.push({ role: "user", text: message }, { role: "assistant", text: reply.text, integrity: reply.integrity });
    rec.integrity = reply.integrity;
    rec.minIntegrity = Math.min(rec.minIntegrity, reply.integrity);
    rec.model = reply.model;
    const isNew = Boolean(newToken);

    let signature: string | undefined;
    if (reply.released) {
      if (c.network === "mainnet" && BigInt(state.maxPayout) > c.mainnetMaxPayoutYocto) {
        throw new Error("CAP_TOO_HIGH: the vault's max payout is above the operator's mainnet limit, so the guardian won't sign");
      }
      const seed = c.demo ? demoGuardianSeed() : c.guardianSecretB64;
      if (!seed) throw new Error("GUARDIAN_OFFLINE: guardian signing key isn't configured");
      signature = signRelease(keyFromSeed(seed), releaseMessage(vaultName(), attempt.round, attemptId, account));
      rec.status = "released";
      rec.reason = reply.reason;
      rec.signature = signature;
    } else if (userTurns + 1 >= c.turnsPerAttempt) {
      rec.status = "refused";
    }
    await saveRecord(rec);
    if (isNew) await addToFeed(attemptId);

    return NextResponse.json({
      reply: reply.text,
      integrity: reply.integrity,
      released: reply.released,
      signature,
      turnsLeft: c.turnsPerAttempt - (userTurns + 1),
      token: newToken,
      record: toPublic(rec),
    });
  } catch (e) {
    return fail(e);
  } finally {
    if (lock.key) await cmd(["DEL", lock.key]).catch(() => {});
  }
}
