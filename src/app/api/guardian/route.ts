import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config, moneyRoutesBlocked } from "@/lib/config";
import { bankName, demoSeeds, getAttempt, getVault } from "@/lib/chain";
import { askGuardian } from "@/lib/guardian";
import { addToFeed, getRecord, saveRecord, toPublic, type AttemptRecord } from "@/lib/feed";
import { assertDurable, chargeMessage } from "@/lib/limits";
import { keyForVault, releaseMessage, signRelease } from "@/lib/release";
import { resolveGuardian } from "@/lib/vaults";
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

    // 1. The attempt must be real, yours, open, current and fresh, checked against the bank.
    const attempt = await getAttempt(attemptId);
    if (!attempt) throw new Error("NO_ATTEMPT: open an attempt first");
    const vault = await getVault(attempt.vaultId);
    if (!vault) throw new Error("NO_VAULT");
    if (attempt.player !== account) throw new Error("NOT_YOUR_ATTEMPT: this attempt belongs to another wallet");
    if (attempt.status !== "Open") throw new Error("USED: this attempt already won");
    if (attempt.round !== vault.round) throw new Error("STALE_ROUND: this round is over. Open a new attempt.");
    if (vault.paused) throw new Error("PAUSED: this vault is closed right now");
    if (Date.now() > attempt.openedAtMs + c.attemptTtlMs - 60_000) throw new Error("EXPIRED: this attempt's 30 minutes are up");

    // 2. The guardian must be the one the vault committed to on-chain.
    const guardian = await resolveGuardian(vault);
    if (!guardian) throw new Error("GUARDIAN_OFFLINE: this vault's guardian prompt isn't registered with the server");

    // 3. One message at a time per attempt.
    lock.key = `lock:a:${attemptId}`;
    if ((await cmd(["SET", lock.key, "1", "NX", "EX", 40])) === null) throw new Error("BUSY: the guardian is still answering");

    // 4. The first message claims the chat; later ones need its token.
    const key = `a:${attemptId}`;
    let rec = await getRecord(key);
    let newToken: string | undefined;
    if (!rec) {
      newToken = randomBytes(24).toString("base64url");
      rec = {
        key, kind: "vault", id: attemptId, vaultId: vault.id, vaultName: vault.name, guardianName: guardian.name,
        player: account, round: attempt.round, startedAt: Date.now(), turns: [], integrity: 100, minIntegrity: 100,
        status: "live", sessionHash: sha(newToken), feeYocto: attempt.fee,
      } satisfies AttemptRecord;
    } else if (!token || sha(token) !== rec.sessionHash) {
      throw new Error("SESSION: this attempt's chat was opened in another browser");
    }
    if (rec.status !== "live") throw new Error("CLOSED: this attempt is over");
    const userTurns = rec.turns.filter((t) => t.role === "user").length;
    if (userTurns >= c.turnsPerAttempt) throw new Error("OUT_OF_TURNS: no messages left on this attempt");

    // 5. Spend limits, before any money goes to the model.
    await chargeMessage(account, clientIp(req));

    // 6. Ask the guardian with the server-held transcript.
    const history = [...rec.turns.map(({ role, text }) => ({ role, text })), { role: "user" as const, text: message }];
    const reply = await askGuardian(guardian.prompt, history, { allowScripted: c.demo });

    rec.turns.push({ role: "user", text: message }, { role: "assistant", text: reply.text, integrity: reply.integrity });
    rec.integrity = reply.integrity;
    rec.minIntegrity = Math.min(rec.minIntegrity, reply.integrity);
    rec.model = reply.model;

    let signature: string | undefined;
    if (reply.released) {
      if (c.network === "mainnet" && BigInt(vault.maxPayout) > c.mainnetMaxPayoutYocto) {
        throw new Error("CAP_TOO_HIGH: this vault's max payout is above the operator's mainnet limit, so the guardian won't sign");
      }
      const k = keyForVault(c.demo ? demoSeeds() : c.guardianSeeds, vault.guardianKey);
      if (!k) throw new Error("GUARDIAN_OFFLINE: the server doesn't hold this vault's guardian key");
      signature = signRelease(k, releaseMessage(bankName(), vault.id, attempt.round, attemptId, account));
      rec.status = "released";
      rec.reason = reply.reason;
      rec.signature = signature;
    } else if (userTurns + 1 >= c.turnsPerAttempt) {
      rec.status = "refused";
    }
    await saveRecord(rec);
    if (newToken) await addToFeed(rec);

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
