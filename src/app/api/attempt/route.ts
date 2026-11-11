import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { attemptFromTx, demoClaim, demoOpen, getAttempt } from "@/lib/chain";
import { getRecord, saveRecord } from "@/lib/feed";
import { ACCOUNT_RE, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET ?tx=&account= : read the attempt a wallet transaction just opened. */
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const tx = p.get("tx") || "";
    const account = p.get("account") || "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(tx) || !ACCOUNT_RE.test(account)) {
      return NextResponse.json({ error: "Send tx (hash) and account.", code: "BAD_REQUEST" }, { status: 400 });
    }
    return NextResponse.json({ attempt: await attemptFromTx(tx, account) });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), account: z.string().regex(ACCOUNT_RE), vaultId: z.number().int().positive() }),
  z.object({ action: z.literal("claim"), account: z.string().regex(ACCOUNT_RE), attemptId: z.number().int(), signature: z.string() }),
  z.object({ action: z.literal("claimed"), attemptId: z.number().int() }),
]);

/**
 * POST open/claim: demo bank only (testnet and mainnet use the wallet).
 * POST claimed: mark a win as claimed after checking the bank says so.
 */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Bad request.", code: "BAD_REQUEST" }, { status: 400 });
    const b = parsed.data;
    const demo = config().demo;
    if (b.action === "open") {
      if (!demo) return NextResponse.json({ error: "Open attempts with your wallet.", code: "WALLET_ONLY" }, { status: 400 });
      return NextResponse.json({ attempt: await demoOpen(b.vaultId, b.account) });
    }
    if (b.action === "claim") {
      if (!demo) return NextResponse.json({ error: "Claim with your wallet.", code: "WALLET_ONLY" }, { status: 400 });
      const amount = await demoClaim(b.attemptId, b.account, b.signature);
      const rec = await getRecord(`a:${b.attemptId}`);
      if (rec) await saveRecord({ ...rec, status: "claimed", payoutYocto: amount });
      return NextResponse.json({ amount });
    }
    const attempt = await getAttempt(b.attemptId);
    if (attempt?.status !== "Won") throw new Error("NOT_WON: the bank hasn't paid this attempt");
    const rec = await getRecord(`a:${b.attemptId}`);
    if (rec && rec.status !== "claimed") await saveRecord({ ...rec, status: "claimed" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
