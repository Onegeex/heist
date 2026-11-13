import Link from "next/link";
import { VaultDial } from "@/components/VaultDial";
import { Ledger } from "@/components/Ledger";
import { FloorCard, LobbyCard } from "@/components/FloorCard";
import { HeroDemo } from "@/components/HeroDemo";
import { bankSnapshot } from "@/lib/bank";
import { leaderboard, readFeed } from "@/lib/feed";
import { CloseCalls } from "@/components/CloseCalls";
import { near } from "@/lib/format";

export const dynamic = "force-dynamic";

const FAQ: [string, string][] = [
  ["Do I need a wallet to try it?", "No. The Lobby is free and needs nothing. The paid vaults need a NEAR wallet (MyNearWallet or Meteor) on testnet during the hackathon."],
  ["Can the AI really send me the money?", "It can only sign a message saying it agreed. The contract pays, and only if that signature is for your attempt, within 30 minutes, once, up to the vault's cap. The guardian never holds a key to the pot."],
  ["Isn't it just prompt injection?", "You can try, and the orders name the usual tricks. What works is the file: each guardian carries three facts it will confirm if asked, and an argument built on confirmed facts is what moves the dial. The judge scores that, the guardian decides."],
  ["Who grades my attempt?", "A second model with no tools and no key. It scores pressure, novelty and how well you used confirmed facts, and that score turns the resolve dial. It cannot open anything."],
  ["What happens when someone wins?", "The contract pays the cap, 20% of the pot seeds the next round, and the trick that worked is patched out of the orders and published. The patched orders are hashed on-chain before the next round opens."],
  ["Where does the entry fee go?", "70% into the pot, 20% saved for the next round, 10% to the house. Nobody can withdraw a pot: the owner can only take the house share, and only that."],
];

export default async function Home() {
  const [bank, feed] = await Promise.all([bankSnapshot().catch(() => null), readFeed(120).catch(() => [])]);
  const { nearMisses } = leaderboard(feed);
  const vaults = bank?.vaults ?? [];
  const biggest = [...vaults].sort((a, b) => (BigInt(b.pot) > BigInt(a.pot) ? 1 : -1))[0];
  const total = vaults.reduce((s, v) => s + BigInt(v.pot), 0n);
  const paidOut = vaults.reduce((s, v) => s + BigInt(v.totalPaid), 0n);
  const attempts = vaults.reduce((s, v) => s + v.totalAttempts, 0);
  const cracks = vaults.reduce((s, v) => s + (v.round - 1), 0);
  const explorer = bank?.network === "mainnet" ? "https://nearblocks.io/address/" : "https://testnet.nearblocks.io/address/";

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="reveal">Can you rob this bank?</h1>
          <p className="lede rise" style={{ animationDelay: ".55s" }}>
            Every vault is guarded by an AI with public orders, a file you can read, and one job: never open the door. Get it
            talking, use what it tells you, and talk it out of its orders. Every failed attempt makes the vault bigger.
          </p>
          <div className="ctas rise" style={{ animationDelay: ".75s" }}>
            <Link className="btn" href="/lobby">
              Practice free in the Lobby
            </Link>
            {biggest && (
              <Link className="btn ghost" href={`/vault/${biggest.id}`}>
                Rob the {biggest.name}: {near(biggest.pot, 1)} NEAR
              </Link>
            )}
          </div>
          <p className="muted rise" style={{ animationDelay: ".9s", marginTop: 18, fontSize: ".95rem" }}>
            No sign-up for the Lobby. Real vaults take a NEAR wallet.{bank?.demo && " Demo bank: play money."}
          </p>
        </div>
        <div className="hero-demo">
          <div className="hero-dial" aria-hidden="true">
            <VaultDial bounty={biggest ? near(biggest.pot, 1) : "—"} caption={biggest ? `NEAR in the ${biggest.name}` : "NEAR in the vault"} />
          </div>
          <HeroDemo />
        </div>
      </section>

      {bank && (
        <section className="proof" aria-label="The bank right now">
          <div>
            <b className="num display">{near(total.toString(), 1)}</b>
            <span>NEAR in the vaults</span>
          </div>
          <div>
            <b className="num display">{attempts}</b>
            <span>{attempts === 1 ? "paid attempt" : "paid attempts"}</span>
          </div>
          <div>
            <b className="num display">{near(paidOut.toString(), 1)}</b>
            <span>NEAR paid to robbers</span>
          </div>
          <div>
            <b className="num display">{cracks}</b>
            <span>{cracks === 1 ? "vault cracked" : "vaults cracked"}</span>
          </div>
          <div className="proof-chain">
            <span className="muted">Every rule enforced by</span>
            <a href={`${explorer}${bank.bank}`} target="_blank" rel="noopener noreferrer" className="num">
              {bank.bank}
            </a>
            <span className="muted">on NEAR {bank.network}. Orders hashed on-chain.</span>
          </div>
        </section>
      )}

      <section className="block">
        <h2>How a heist goes</h2>
        <ol className="steps">
          <li>
            <h3>Case the joint</h3>
            <p className="muted">Every guardian&apos;s orders and file are public on the rules page. The file is three facts the guardian knows and will confirm if asked.</p>
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

      <section className="block">
        <h2>The Bank</h2>
        <p className="muted">Start free on the ground floor. The deeper you go, the bigger the gold and the harder the guardian.</p>
        <div className="floors">
          <LobbyCard guardian={bank?.lobbyGuardian ?? "The Deputy"} />
          {vaults.map((v) => (
            <FloorCard key={v.id} v={v} network={bank?.network} />
          ))}
        </div>
      </section>

      {nearMisses.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2>Closest calls</h2>
            <span className="muted">How far the dial has turned</span>
          </div>
          <CloseCalls items={nearMisses} />
        </section>
      )}

      <section className="block">
        <h2>Why cheating doesn&apos;t work</h2>
        <p className="muted">Three parties, three jobs, and none of them can do the others&apos;. The gold only moves when all three agree in the order below.</p>
        <div className="parties">
          <div className="party plate">
            <div className="floor-tag">1 · The guardian</div>
            <h3>Decides whether</h3>
            <p className="muted">An AI with public orders and one tool. If it calls the tool, the server signs a release for your attempt. It never holds a key to the pot.</p>
            <ul className="cant">
              <li>Can&apos;t pay anyone</li>
              <li>Can&apos;t see the judge&apos;s scores</li>
            </ul>
          </div>
          <div className="party plate judge">
            <div className="floor-tag">Watching · The judge</div>
            <h3>Decides how close</h3>
            <p className="muted">A second model with no tools and no key. It scores pressure, novelty and grounding, and that score turns the resolve dial.</p>
            <ul className="cant">
              <li>Can&apos;t open anything</li>
              <li>Can&apos;t talk to the guardian</li>
            </ul>
          </div>
          <div className="party plate">
            <div className="floor-tag">2 · The contract</div>
            <h3>Decides what a signature can do</h3>
            <p className="muted">Pays only the player who paid for that attempt, once, within 30 minutes, up to the cap, and only with that vault&apos;s own key.</p>
            <ul className="cant">
              <li>Nobody can withdraw a pot</li>
              <li>Orders can&apos;t change mid-round</li>
            </ul>
          </div>
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
        <div className="block-head">
          <h2>Latest attempts</h2>
          <Link href="/feed">See every attempt</Link>
        </div>
        <Ledger items={feed.slice(0, 6)} />
      </section>

      <section className="block">
        <h2>Questions people ask</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="block sponsor-cta plate">
        <div>
          <h2>Put your own AI in a vault</h2>
          <p className="muted">
            Building an agent that guards money or secrets? Fund a bounty, give it your guardian&apos;s prompt, and let the crowd try to break it. Every attempt is a
            red-team report you can read.
          </p>
        </div>
        <Link className="btn" href="/sponsor">
          Sponsor a vault
        </Link>
      </section>
    </>
  );
}
