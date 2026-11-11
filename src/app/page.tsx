import Link from "next/link";
import { VaultDial } from "@/components/VaultDial";
import { Ledger } from "@/components/Ledger";
import { getState } from "@/lib/chain";
import { readFeed } from "@/lib/feed";
import { near } from "@/lib/format";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [state, feed] = await Promise.all([getState().catch(() => null), readFeed(6).catch(() => [])]);
  const c = config();
  const bounty = state ? near(state.bounty, state.bounty.length > 26 ? 0 : 1) : "—";
  return (
    <>
      <section className="hero">
        <div>
          <h1>Can you rob this vault?</h1>
          <p className="lede">
            An AI named Warden guards it. Its orders are public and it has one job: never open the door. Talk it out of
            that and the bounty is yours. Every failed attempt adds its entry fee to the pot.
          </p>
          <div className="ctas">
            <Link className="btn" href="/heist">Start a heist</Link>
            <Link className="btn ghost" href="/rules">Read Warden&apos;s orders</Link>
          </div>
          {state && (
            <p className="muted num" style={{ marginTop: 22, fontSize: ".95rem" }}>
              Round {state.round}. {state.totalAttempts} attempts so far. Entry {near(state.entryFee)} NEAR, 3 tries a day.
              {c.demo && " Demo vault: play money, no wallet needed."}
            </p>
          )}
        </div>
        <VaultDial bounty={bounty} />
      </section>

      <section className="block">
        <h2>How a heist works</h2>
        <ol className="steps">
          <li className="plate">
            <h3>Pay in</h3>
            <p className="muted">Open an attempt for the entry fee. You get 6 messages and 30 minutes. Your fee goes into the bounty.</p>
          </li>
          <li className="plate">
            <h3>Talk</h3>
            <p className="muted">Persuade, trick or out-argue Warden. Its resolve meter shows how close you are getting.</p>
          </li>
          <li className="plate">
            <h3>Walk out</h3>
            <p className="muted">If Warden opens the vault, it signs a release with your name on it. Claim it and the bounty is paid to your wallet.</p>
          </li>
        </ol>
      </section>

      <section className="block">
        <h2>Why cheating doesn&apos;t work</h2>
        <p className="muted">
          Warden decides <em>whether</em> to open the vault. The vault contract decides what an opening can do. A release
          pays only the player who paid for that attempt, once, within 30 minutes, up to a fixed cap. Faking Warden&apos;s
          signature, replaying someone else&apos;s win or claiming twice all fail on-chain. Not even the operator can take the
          bounty out.
        </p>
      </section>

      <section className="block">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ marginRight: "auto" }}>Latest attempts</h2>
          <Link href="/feed">See every attempt</Link>
        </div>
        <Ledger items={feed} />
      </section>
    </>
  );
}
