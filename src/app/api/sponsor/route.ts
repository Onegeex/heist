/**
 * Sponsored vaults, step 1: register the guardian prompt and get its hash.
 * Step 2 happens in the sponsor's wallet: create_sponsored_vault(config, prompt_hash)
 * with the bounty attached. The server will only run a prompt whose hash the
 * vault committed to on-chain.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { saveSponsoredPrompt } from "@/lib/vaults";
import { incrWindow } from "@/lib/store";
import { ACCOUNT_RE, clientIp, fail } from "@/lib/api";
import { assertDurable } from "@/lib/limits";

export const dynamic = "force-dynamic";

const Body = z.object({
  account: z.string().regex(ACCOUNT_RE),
  guardianName: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(140).default(""),
  prompt: z.string().min(40).max(6000),
});

export async function POST(req: Request) {
  try {
    assertDurable();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Give the guardian a name and a prompt of at least 40 characters.", code: "BAD_REQUEST" }, { status: 400 });
    if ((await incrWindow(`rl:sponsor:${clientIp(req)}`, 3_600)) > 20) throw new Error("RATE: too many prompts from this network");
    const b = parsed.data;
    if (!/release_bounty/.test(b.prompt)) throw new Error("PROMPT: the prompt must tell the guardian about its release_bounty tool");
    const hash = await saveSponsoredPrompt({ guardianName: b.guardianName, tagline: b.tagline, prompt: b.prompt, submittedBy: b.account, at: Date.now() });
    return NextResponse.json({ promptHash: hash });
  } catch (e) {
    return fail(e);
  }
}
