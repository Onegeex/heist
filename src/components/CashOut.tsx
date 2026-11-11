"use client";

import { useEffect, useState } from "react";
import * as wallet from "@/lib/wallet";

type Tok = { assetId: string; symbol: string; chain: string };

/** Mainnet only: send winnings to another chain through NEAR Intents 1Click. */
export function CashOut({ account }: { account: string }) {
  const [tokens, setTokens] = useState<Tok[]>([]);
  const [asset, setAsset] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ depositAddress: string; amountOut: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payout").then((r) => r.json()).then((d) => {
      if (d.available) {
        setTokens(d.tokens);
        setAsset(d.tokens[0]?.assetId ?? "");
      }
    });
  }, []);
  if (!tokens.length) return null;

  const yocto = () => {
    const [w, f = ""] = amount.split(".");
    return (BigInt(w || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
  };

  async function getQuote() {
    setMsg(null);
    const r = await fetch("/api/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, amountYocto: yocto(), destinationAsset: asset, recipient, dry: false }),
    });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    setQuote(d);
  }

  return (
    <div className="plate" style={{ textAlign: "left", marginTop: 18 }}>
      <h3>Cash out to another chain</h3>
      <p className="muted">Uses NEAR Intents. Your wallet wraps the NEAR and sends it to a 1Click deposit address in one transaction.</p>
      <label>Amount (NEAR)<input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Receive
        <select className="field" value={asset} onChange={(e) => setAsset(e.target.value)}>
          {tokens.map((t) => <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.chain}</option>)}
        </select>
      </label>
      <label>Recipient address on that chain<input className="field" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
      {quote ? (
        <p>
          You&apos;ll receive about <b>{quote.amountOut}</b>.{" "}
          <button className="btn" onClick={() => wallet.cashOut(quote.depositAddress, yocto())}>Send with wallet</button>
        </p>
      ) : (
        <button className="btn ghost" disabled={!amount || !recipient} onClick={getQuote}>Get a quote</button>
      )}
      {msg && <div className="notice" role="alert">{msg}</div>}
    </div>
  );
}
