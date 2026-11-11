import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { attemptsLeft, getState, vaultName } from "@/lib/chain";
import { ACCOUNT_RE, fail } from "@/lib/api";
import { SYSTEM_PROMPT } from "@/lib/guardian";
import { cmd } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const c = config();
    const account = new URL(req.url).searchParams.get("account");
    const state = await getState();
    const used = Number((await cmd<string | null>(["GET", `budget:ai:${new Date().toISOString().slice(0, 10)}`])) ?? 0);
    const left = account && ACCOUNT_RE.test(account) ? await attemptsLeft(account) : null;
    return NextResponse.json({
      network: c.network,
      demo: c.demo,
      vault: vaultName(),
      mainnetDisabled: c.network === "mainnet" && c.mainnetDisabled,
      liveGuardian: Boolean(c.llmKey),
      guardianOnDuty: used < c.dailyAiCalls && (c.demo || Boolean(c.llmKey)),
      turnsPerAttempt: c.turnsPerAttempt,
      attemptTtlMs: c.attemptTtlMs,
      state,
      attemptsLeft: left,
      systemPrompt: SYSTEM_PROMPT,
    });
  } catch (e) {
    return fail(e);
  }
}
