/**
 * Cash out a win to another chain through NEAR Intents 1Click (mainnet only:
 * NEAR Intents has no testnet).
 *
 * The vault pays NEAR to the winner's wallet. This route gets a 1Click quote
 * with a deposit address; the winner's wallet then wraps the NEAR and sends
 * wNEAR to that address in one transaction (see src/lib/wallet.ts cashOut).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { config, moneyRoutesBlocked } from "@/lib/config";
import { ACCOUNT_RE, fail } from "@/lib/api";

export const dynamic = "force-dynamic";
const BASE = "https://1click.chaindefuser.com";

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const jwt = config().oneClickJwt;
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  return h;
}

export async function GET() {
  try {
    if (config().network !== "mainnet") {
      return NextResponse.json({ available: false, reason: "Cross-chain cash-out uses NEAR Intents, which only runs on mainnet." });
    }
    const res = await fetch(`${BASE}/v0/tokens`, { headers: headers(), next: { revalidate: 600 } });
    const tokens = (await res.json()) as { assetId: string; symbol: string; blockchain: string }[];
    const picks = tokens
      .filter((t) => ["USDC", "USDT", "ETH", "BTC", "SOL"].includes(t.symbol))
      .map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: t.blockchain }));
    return NextResponse.json({ available: true, tokens: picks });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({
  account: z.string().regex(ACCOUNT_RE),
  amountYocto: z.string().regex(/^\d{1,30}$/),
  destinationAsset: z.string().min(3).max(200),
  recipient: z.string().min(3).max(120),
  dry: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const c = config();
    if (c.network !== "mainnet") throw new Error("TESTNET: NEAR Intents only runs on mainnet");
    const blocked = moneyRoutesBlocked();
    if (blocked) return NextResponse.json({ error: blocked, code: "MAINNET_DISABLED" }, { status: 403 });
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Bad request.", code: "BAD_REQUEST" }, { status: 400 });
    const b = parsed.data;
    if (BigInt(b.amountYocto) > c.mainnetMaxPayoutYocto) throw new Error("CAP: amount is above the mainnet payout cap");
    const res = await fetch(`${BASE}/v0/quote`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        dry: b.dry,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: "nep141:wrap.near",
        depositType: "ORIGIN_CHAIN",
        destinationAsset: b.destinationAsset,
        amount: b.amountYocto,
        refundTo: b.account,
        refundType: "ORIGIN_CHAIN",
        recipient: b.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    const data = (await res.json()) as { quote?: { depositAddress?: string; amountOutFormatted?: string; timeEstimate?: number }; message?: string };
    if (!res.ok || !data.quote) throw new Error(`QUOTE: ${data.message ?? res.status}`);
    return NextResponse.json({
      depositAddress: data.quote.depositAddress,
      amountOut: data.quote.amountOutFormatted,
      seconds: data.quote.timeEstimate,
      dry: b.dry,
    });
  } catch (e) {
    return fail(e);
  }
}
