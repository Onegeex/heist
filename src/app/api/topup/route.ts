/**
 * Top up from any chain with NEAR Intents 1Click. Non-custodial: the player
 * sends a token from another chain to a 1Click deposit address, and wNEAR is
 * delivered straight to the player's own NEAR account. Heist never holds it.
 *
 * NEAR Intents only runs on mainnet. On testnet (or with the kill switch on)
 * every quote is a dry run: real prices, no deposit address.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { config, moneyRoutesBlocked } from "@/lib/config";
import { ACCOUNT_RE, fail } from "@/lib/api";

export const dynamic = "force-dynamic";
const BASE = "https://1click.chaindefuser.com";
const WNEAR = "nep141:wrap.near";
const SYMBOLS = ["USDC", "USDT", "ETH", "SOL", "BTC"];
const CHAIN_NAMES: Record<string, string> = {
  sol: "Solana", eth: "Ethereum", base: "Base", arb: "Arbitrum", btc: "Bitcoin", bsc: "BNB Chain", pol: "Polygon",
  op: "Optimism", tron: "Tron", gnosis: "Gnosis", aptos: "Aptos", avax: "Avalanche", ton: "TON", sui: "Sui",
};

type Token = { assetId: string; symbol: string; blockchain: string; decimals: number; price: number };

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config().oneClickJwt) h.Authorization = `Bearer ${config().oneClickJwt}`;
  return h;
}

async function tokens(): Promise<Token[]> {
  const res = await fetch(`${BASE}/v0/tokens`, { headers: headers(), next: { revalidate: 300 } });
  const all = (await res.json()) as Token[];
  return all.filter((t) => SYMBOLS.includes(t.symbol) && t.blockchain !== "near" && CHAIN_NAMES[t.blockchain]);
}

const live = () => config().network === "mainnet" && !moneyRoutesBlocked();

/** GET: origin tokens, or ?depositAddress= for a swap's status. */
export async function GET(req: Request) {
  try {
    const dep = new URL(req.url).searchParams.get("depositAddress");
    if (dep) {
      if (!/^[A-Za-z0-9:_.-]{10,120}$/.test(dep)) throw new Error("BAD_REQUEST: bad deposit address");
      const r = await fetch(`${BASE}/v0/status?depositAddress=${encodeURIComponent(dep)}`, { headers: headers(), cache: "no-store" });
      const d = (await r.json()) as { status?: string; swapDetails?: { amountOut?: string; amountOutFormatted?: string } };
      return NextResponse.json({ status: d.status ?? "PENDING_DEPOSIT", amountOut: d.swapDetails?.amountOut, amountOutFormatted: d.swapDetails?.amountOutFormatted });
    }
    const list = (await tokens()).map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: CHAIN_NAMES[t.blockchain], price: t.price }));
    list.sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol) || a.chain.localeCompare(b.chain));
    return NextResponse.json({ live: live(), network: config().network, tokens: list });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({
  account: z.string().regex(ACCOUNT_RE).optional(),
  assetId: z.string().min(5).max(200),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  refundTo: z.string().min(10).max(120),
});

/** POST: quote. Live on mainnet (returns a deposit address), dry everywhere else. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Pick a token, an amount and your refund address on that chain.", code: "BAD_REQUEST" }, { status: 400 });
    const b = parsed.data;
    const t = (await tokens()).find((x) => x.assetId === b.assetId);
    if (!t) throw new Error("TOKEN: that token isn't supported for top-ups");
    const [w, f = ""] = b.amount.split(".");
    const units = (BigInt(w) * 10n ** BigInt(t.decimals) + BigInt((f + "0".repeat(t.decimals)).slice(0, t.decimals))).toString();
    if (Number(b.amount) * t.price > 500) throw new Error("LIMIT: top-ups are capped at $500 per quote");
    const isLive = live();
    if (isLive && !b.account) throw new Error("ACCOUNT: connect your NEAR wallet so the NEAR goes to you");
    const res = await fetch(`${BASE}/v0/quote`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        dry: !isLive,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: t.assetId,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: WNEAR,
        amount: units,
        refundTo: b.refundTo,
        refundType: "ORIGIN_CHAIN",
        // dry runs (testnet) still need a real mainnet recipient for pricing
        recipient: isLive ? b.account : "wrap.near",
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    const d = (await res.json()) as {
      quote?: { depositAddress?: string; amountOut?: string; amountOutFormatted?: string; amountOutUsd?: string; timeEstimate?: number; deadline?: string };
      message?: string;
    };
    if (!res.ok || !d.quote) throw new Error(`QUOTE: ${d.message ?? `1Click error ${res.status}`}`);
    return NextResponse.json({
      live: isLive,
      depositAddress: isLive ? d.quote.depositAddress : undefined,
      send: `${b.amount} ${t.symbol} on ${CHAIN_NAMES[t.blockchain]}`,
      amountOut: d.quote.amountOut,
      amountOutFormatted: d.quote.amountOutFormatted,
      amountOutUsd: d.quote.amountOutUsd,
      seconds: d.quote.timeEstimate,
      deadline: d.quote.deadline,
    });
  } catch (e) {
    return fail(e);
  }
}
