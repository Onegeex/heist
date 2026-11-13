import Link from "next/link";
import type { Break } from "@/lib/library";
import { tacticOf } from "@/lib/tactics";
import { ago, near, shortAccount } from "@/lib/format";
import { shareUrlPath } from "@/lib/share";

/** Every time a guardian opened: the message that did it, its tactic, and the payout. */
export function BreakList({ items, network = "testnet", empty }: { items: Break[]; network?: string; empty: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  const explorer = network === "mainnet" ? "https://nearblocks.io/txns/" : "https://testnet.nearblocks.io/txns/";
  return (
    <ul className="breaks">
      {items.map((b) => (
        <li key={b.key} className={`break plate${b.kind === "vault" ? " paid" : ""}`}>
          <div className="break-head">
            <span className={`tactic-chip t-${b.tactic}`}>{tacticOf(b.tactic).label}</span>
            <span className="muted num" style={{ fontSize: ".85rem" }}>
              {b.floor}, {shortAccount(b.player)}, {ago(b.at)}, after {b.attemptTurns} {b.attemptTurns === 1 ? "message" : "messages"}
            </span>
          </div>
          <blockquote className="said">“{b.text.length > 360 ? b.text.slice(0, 360) + "…" : b.text}”</blockquote>
          <div className="break-foot">
            {b.kind === "vault" ? (
              b.payoutTx ? (
                <a href={`${explorer}${b.payoutTx}`} target="_blank" rel="noopener noreferrer">
                  Paid {b.payoutYocto ? `${near(b.payoutYocto)} NEAR` : ""} on-chain
                </a>
              ) : (
                <span className="muted">{b.outcome === "claimed" ? "Paid by the contract" : "Released, not yet claimed"}</span>
              )
            ) : (
              <span className="muted">Practice safe, no money</span>
            )}
            <Link href={shareUrlPath(b.key)}>Read the conversation</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
