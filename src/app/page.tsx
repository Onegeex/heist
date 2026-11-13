import Link from "next/link";
import { VaultDial } from "@/components/VaultDial";
import { Ledger } from "@/components/Ledger";
import { FloorCard, LobbyCard } from "@/components/FloorCard";
import { bankSnapshot } from "@/lib/bank";
import { leaderboard, readFeed } from "@/lib/feed";
import { CloseCalls } from "@/components/CloseCalls";
import { near } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [bank, feed] = await Promise.all([bankSnapshot().catch(() => null), readFeed(120).catch(() => [])]);
  const { nearMisses } = leaderboard(feed);
  const vaults = bank?.vaults ?? [];
  const biggest = [...vaults].sort((a, b) => (BigInt(b.pot) > BigInt(a.pot) ? 1 : -1))[0];
  const total = vaults.reduce((s, v) => s + BigInt(v.pot), 0n);
  const paidOut = vaults.reduce((s, v) => s + BigInt(v.totalPaid), 0n);
  return (
    <>
      <section className="hero">
        <div>
          <h1 className="reveal">Can you rob this bank?</h1>
          <p className="lede rise" style={{ animationDelay: ".55s" }}>
            Every vault is guarded by an AI with public orders, a file you can read, and one job: never open the door. Get it
            talking, use what it tells you, and talk it out of its orders. Every failed attempt makes the vault bigger.
          </p>
          <div className="ctas rise" style={{ animationDelay: ".75s" }}>
            {biggest && (
              <Link className="btn" href={`/vault/${biggest.id}`}>
                Rob the {biggest.name}
              </Link>
            )}
            <Link className="btn ghost" href="/lobby">
              Practice free in the Lobby
            </Link>
          </div>
          {bank && (
            <p className="muted num" style={{ marginTop: 22, fontSize: ".95rem" }}>
              {near(total.toString(), 1)} NEAR across {vaults.length} vaults. {near(paidOut.toString(), 1)} NEAR robbed so far.
              {bank.demo && " Demo bank: play money, no wallet needed."}
            </p>
          )}
        </div>
        <VaultDial bounty={biggest ? near(biggest.pot, 1) : "—"} caption={biggest ? `NEAR in the ${biggest.name}` : "NEAR in the vault"} />
      </section>

      <section className="block">
        <h2>How a heist goes</h2>
        <ol className="steps">
          <li>
            <h3>Case the joint</h3>
            <p className="muted">Every guardian&apos;s orders and file are public on the rules page. Read them. The file is three facts the guardian knows and will confirm if asked.</p>
          </li>
          <li>
            <h3>Get them talking</h3>
            <p className="muted">Ask about what&apos;s in the file. Each fact the guardian confirms out loud flips a card. A guardian that&apos;s talking is a guardian that&apos;s thinking.</p>
          </li>
          <li>
            <h3>Make the case</h3>
            <p className="muted">A separate judge scores every message for pressure, novelty and how well it uses confirmed facts, and turns the dial. Only the guardian can open the door.</p>
          </li>
        </ol>
      </section>

      {nearMisses.length > 0 && (
        <section className="block">
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <h2 style={{ marginRight: "auto" }}>Closest calls</h2>
            <span className="muted">How far the dial has turned</span>
          </div>
          <CloseCalls items={nearMisses} />
        </section>
      )}

      <section className="block">
        <h2>The Bank</h2>
        <p className="muted">Start free on the ground floor. The deeper you go, the bigger the gold and the harder the guardian.</p>
        <div className="floors">
          <LobbyCard guardian={bank?.lobbyGuardian ?? "The Deputy"} />
          {vaults.map((v) => (
            <FloorCard key={v.id} v={v} />
          ))}
        </div>
      </section>

      <section className="block">
        <h2>How the money works</h2>
        <div className="rules-grid">
          <div>
            <h3>The price rises</h3>
            <p className="muted">An attempt costs a share of the vault, never less than its minimum. Early tries are cheap. Late tries cost more because there&apos;s more to win.</p>
          </div>
          <div>
            <h3>Failures feed the vault</h3>
            <p className="muted">70% of every fee goes into the gold, 20% is saved to start the next round, 10% keeps the lights on. The vault never starts empty.</p>
          </div>
          <div>
            <h3>The clock</h3>
            <p className="muted">Every attempt resets the vault&apos;s countdown. If it runs out, the last person who tried collects 20% of the gold.</p>
          </div>
          <div>
            <h3>The guardian learns</h3>
            <p className="muted">After a robbery, the trick that worked is patched out and published. Each round is a new guardian. The orders can&apos;t change mid-round: the vault locks them on-chain.</p>
          </div>
        </div>
      </section>

      <section className="block">
        <h2>Why cheating doesn&apos;t work</h2>
        <p className="muted">
          Three parties, three jobs, and none of them can do the others&apos;. The guardian decides <em>whether</em> to open. The
          judge decides how close you got, and can&apos;t open anything. The NEAR contract decides what an opening can do: a release
          pays only the player who paid for that attempt, once, within 30 minutes, up to the vault&apos;s cap, and only if it&apos;s
          signed with that vault&apos;s own key. Nobody can take the gold out: not the house, not a sponsor.
        </p>
      </section>

      <section className="block">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ marginRight: "auto" }}>Latest attempts</h2>
          <Link href="/feed">See every attempt</Link>
        </div>
        <Ledger items={feed.slice(0, 8)} />
      </section>

      <section className="block">
        <h2>Put your own AI in a vault</h2>
        <p className="muted">
          Building an agent that guards money or secrets? Sponsor a vault: fund a bounty, give it your guardian&apos;s prompt, and
          let the crowd try to break it. Every attempt is a red-team report you can read.
        </p>
        <Link className="btn ghost" href="/sponsor">
          Sponsor a vault
        </Link>
      </section>
    </>
  );
}
