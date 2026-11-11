import { NextResponse } from "next/server";
import { attemptsLeft, getVault } from "@/lib/chain";
import { readFeed } from "@/lib/feed";
import { resolveGuardian } from "@/lib/vaults";
import { sha256B64 } from "@/lib/prompts";
import { ACCOUNT_RE, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Everything a spectator needs: the vault, its guardian's public orders, and the latest attempts. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const vault = Number.isInteger(id) ? await getVault(id) : null;
    if (!vault) return NextResponse.json({ error: "No such vault.", code: "NO_VAULT" }, { status: 404 });
    const account = new URL(req.url).searchParams.get("account");
    const [guardian, feed, left] = await Promise.all([
      resolveGuardian(vault),
      readFeed(30, id),
      account && ACCOUNT_RE.test(account) ? attemptsLeft(id, account).catch(() => null) : null,
    ]);
    return NextResponse.json({
      vault,
      countdownEndsAt: vault.lastAttemptAtMs ? vault.lastAttemptAtMs + vault.countdownMs : null,
      guardian: guardian && { ...guardian, hash: sha256B64(guardian.prompt), matchesChain: sha256B64(guardian.prompt) === vault.promptHash },
      feed,
      attemptsLeft: left,
    });
  } catch (e) {
    return fail(e);
  }
}
