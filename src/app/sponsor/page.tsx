import Link from "next/link";
import { SponsorClient } from "./SponsorClient";

export const metadata = {
  title: "Red-team your agent — Heist",
  description: "Put your AI agent in a vault with a bounty. Players pay to attack it, every failure grows the bounty, and you get a live red-team report.",
};

export default function SponsorPage() {
  return (
    <div style={{ paddingBottom: 40 }}>
      <section className="page-head">
        <h1>Red-team your agent with real stakes</h1>
        <p className="lede">
          Building an agent that holds money, keys or secrets? Put it in a vault with a bounty. Players pay to attack it, every failed attempt grows the bounty, and you
          get a live report of what they tried, what moved it, what it gave away, and what broke it.
        </p>
        <div className="ctas">
          <a className="btn" href="#open">
            Open a vault
          </a>
          <Link className="btn ghost" href="/report/1">
            See a sample report
          </Link>
        </div>
      </section>

      <section className="block">
        <h2>What you get</h2>
        <div className="rules-grid">
          <div>
            <h3>A report that writes itself</h3>
            <p className="muted">
              Every message to your guardian is scored by an independent judge and tagged by tactic. Your vault&apos;s report shows which tactics cost it the most
              resolve, which it shrugs off, and the exact message behind any break. <Link href="/report/1">Example</Link>.
            </p>
          </div>
          <div>
            <h3>Attackers with a reason to try</h3>
            <p className="muted">
              A free prompt-injection playground gets tourists. A bounty that grows with every failure gets people who think hard. Your pot is the incentive, and players
              fund most of it.
            </p>
          </div>
          <div>
            <h3>What leaks, measured</h3>
            <p className="muted">Give your guardian a file of facts and the report tracks how often players get each one confirmed, cite it back, and hold it when the door opens.</p>
          </div>
          <div>
            <h3>Everything other agents learned</h3>
            <p className="muted">
              Before you open a vault, read the <Link href="/library">attack library</Link>: every tactic tried against every guardian here, tagged, with what worked.
              Test your orders against it.
            </p>
          </div>
        </div>
      </section>

      <section className="block">
        <h2>The rules for sponsors</h2>
        <ul className="muted sponsor-rules">
          <li>Your bounty is locked in the NEAR contract. It can be won, never withdrawn, by anyone, you included.</li>
          <li>Your guardian runs on Heist&apos;s servers with the same rules as the house vaults. Its orders are locked by hash on-chain and can&apos;t change mid-round.</li>
          <li>You can patch the orders between rounds, after someone wins. Patch notes are public, and the report shows which tactics each patch closed.</li>
          <li>Players&apos; fees grow your vault: 70% to the pot, 20% saved for the next round, 10% to Heist.</li>
          <li>A win pays at most the cap you set, and only to the player who paid for that attempt, within 30 minutes.</li>
        </ul>
      </section>

      <section className="block" id="open">
        <h2>Open a vault</h2>
        <SponsorClient />
      </section>
    </div>
  );
}
