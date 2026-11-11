"use client";

import { useEffect, useState } from "react";
import * as wallet from "@/lib/wallet";
import { near } from "@/lib/format";

type Tok = { assetId: string; symbol: string; chain: string; price: number };
type Quote = { live: boolean; depositAddress?: string; send: string; amountOut: string; amountOutFormatted: string; amountOutUsd?: string; seconds?: number };

/**
 * Top up from any chain (NEAR Intents 1Click). The NEAR lands in the player's
 * own wallet; Heist never holds it. Testnet shows live dry-run prices only.
 */
export function TopUp({ account, feeYocto, network }: { account: string | null; feeYocto?: string; network: "testnet" | "mainnet" }) {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [live, setLive] = useState(false);
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("10");
  const [refund, setRefund] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || tokens.length) return;
    fetch("/api/topup")
      .then((r) => r.json())
      .then((d) => {
        if (d.tokens) {
          setTokens(d.tokens);
          setLive(d.live);
          setAsset(d.tokens.find((t: Tok) => t.symbol === "USDC" && t.chain === "Solana")?.assetId ?? d.tokens[0]?.assetId ?? "");
        } else setError(d.error ?? "Top-ups are unavailable right now.");
      })
      .catch(() => setError("Top-ups are unavailable right now."));
  }, [open, tokens.length]);

  // Poll a live swap until it lands.
  useEffect(() => {
    if (!quote?.depositAddress || status === "SUCCESS" || status === "REFUNDED" || status === "FAILED") return;
    const t = setInterval(async () => {
      const d = await fetch(`/api/topup?depositAddress=${encodeURIComponent(quote.depositAddress!)}`).then((r) => r.json());
      if (d.status) setStatus(d.status);
    }, 6000);
    return () => clearInterval(t);
  }, [quote, status]);

  const tok = tokens.find((t) => t.assetId === asset);

  async function getQuote() {
    setBusy(true);
    setError(null);
    setQuote(null);
    setStatus(null);
    try {
      const r = await fetch("/api/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: account ?? undefined, assetId: asset, amount, refundTo: refund.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setQuote(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No quote.");
    } finally {
      setBusy(false);
    }
  }

  const tries = quote && feeYocto && BigInt(feeYocto) > 0n ? Number(BigInt(quote.amountOut) / BigInt(feeYocto)) : null;

  if (!open) {
    return (
      <button className="btn ghost" style={{ marginTop: 12, fontSize: ".9rem" }} onClick={() => setOpen(true)}>
        Top up from any chain
      </button>
    );
  }

  return (
    <div className="topup">
      <h3 style={{ fontSize: "1.4rem", margin: "6px 0" }}>Top up from any chain</h3>
      <p className="muted" style={{ fontSize: ".88rem" }}>
        Pay with USDC, USDT, ETH, SOL or BTC from another chain. NEAR Intents swaps it and delivers NEAR straight to your wallet.
        Heist never holds your money.
      </p>
      {network !== "mainnet" && (
        <div className="notice info" style={{ fontSize: ".88rem" }}>
          <p>NEAR Intents only runs on mainnet, so on testnet this shows a live price preview. To play here, use testnet NEAR from a faucet.</p>
        </div>
      )}
      {network === "mainnet" && !live && <div className="notice">The operator has paused mainnet, so quotes are previews only.</div>}
      <label className="muted" style={{ fontSize: ".88rem" }}>
        Pay with
        <select className="field" value={asset} onChange={(e) => setAsset(e.target.value)}>
          {tokens.map((t) => (
            <option key={t.assetId} value={t.assetId}>
              {t.symbol} on {t.chain}
            </option>
          ))}
        </select>
      </label>
      <label className="muted" style={{ fontSize: ".88rem" }}>
        Amount{tok ? ` (${tok.symbol})` : ""}
        <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="muted" style={{ fontSize: ".88rem" }}>
        Your address on {tok?.chain ?? "that chain"} (refunds go here if the swap fails)
        <input className="field" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder={tok?.chain === "Solana" ? "e.g. 7xKX…" : "0x…"} />
      </label>
      <button className="btn" disabled={busy || !asset || !amount || refund.trim().length < 10} onClick={getQuote}>
        {busy ? "Getting a price…" : live ? "Get deposit address" : "Preview price"}
      </button>
      {error && <div className="notice" role="alert">{error}</div>}
      {quote && (
        <div className="notice info" style={{ marginTop: 10 }}>
          <p>
            Send <b>{quote.send}</b>, receive about <b>{Number(quote.amountOutFormatted).toFixed(3)} NEAR</b>
            {quote.amountOutUsd ? ` (~$${Number(quote.amountOutUsd).toFixed(2)})` : ""} in about {quote.seconds ?? 30} seconds.
            {tries !== null && ` That's ${tries} ${tries === 1 ? "try" : "tries"} at this vault's current price.`}
          </p>
          {quote.live && quote.depositAddress ? (
            <>
              <p style={{ wordBreak: "break-all" }}>
                Deposit address: <code>{quote.depositAddress}</code>{" "}
                <button className="btn ghost" style={{ padding: ".2em .6em", fontSize: ".8rem" }} onClick={() => navigator.clipboard?.writeText(quote.depositAddress!)}>
                  Copy
                </button>
              </p>
              <p className="muted" style={{ fontSize: ".88rem" }}>Status: {status ?? "waiting for your deposit"}</p>
              {status === "SUCCESS" && (
                <button className="btn" onClick={() => wallet.unwrap(quote.amountOut)}>
                  Unwrap {near(quote.amountOut, 3)} wNEAR to NEAR
                </button>
              )}
            </>
          ) : (
            <p className="muted" style={{ fontSize: ".88rem" }}>Preview only: no deposit address on {network}.</p>
          )}
        </div>
      )}
    </div>
  );
}
