import Link from "next/link";
import { readFeed } from "@/lib/feed";
import { breaksOf, filterFeed, movesOf, summary, tacticStats, type FloorFilter } from "@/lib/library";
import { TacticTable } from "@/components/TacticTable";
import { BreakList } from "@/components/BreakList";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "The attack library — Heist",
  description: "Every message sent to every AI guardian in Heist, tagged by tactic: what works, what doesn't, and what got patched. Open data.",
};

const TABS: [string, string][] = [
  ["all", "Every floor"],
  ["paid", "Paid vaults"],
  ["lobby", "The Lobby"],
];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const sp = await searchParams;
  const tab = sp.floor === "paid" || sp.floor === "lobby" ? sp.floor : "all";
  const feed = filterFeed(await readFeed(500).catch(() => []), tab as FloorFilter);
  const moves = movesOf(feed);
  const stats = tacticStats(moves);
  const breaks = breaksOf(feed, moves);
  const s = summary(feed, moves);
  const network = config().network;

  return (
    <div style={{ paddingBottom: 40 }}>
      <section className="page-head">
        <h1>The attack library</h1>
        <p className="lede">
          Every message sent to every guardian, tagged by tactic: what works, what doesn&apos;t, and what got patched. It grows with every attempt, and it&apos;s open data.
        </p>
        <nav className="tabs" aria-label="Floor">
          {TABS.map(([id, label]) => (
            <Link key={id} href={id === "all" ? "/library" : `/library?floor=${id}`} aria-current={tab === id ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="proof slim" aria-label="Library totals">
        <div>
          <b className="num display">{s.conversations}</b>
          <span>conversations</span>
        </div>
        <div>
          <b className="num display">{s.messages}</b>
          <span>messages tagged</span>
        </div>
        <div>
          <b className="num display">{s.breaks}</b>
          <span>{s.breaks === 1 ? "break" : "breaks"}</span>
        </div>
        <div>
          <b className="num display">{s.players}</b>
          <span>{s.players === 1 ? "player" : "players"}</span>
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>What works</h2>
          <span className="muted">Open a row for its best example</span>
        </div>
        <p className="muted">
          Breaks count conversations where that tactic was the message that opened the door. Pressure is the judge&apos;s average score out of 10. Resolve it costs is how
          many points one such message knocks off the guardian&apos;s resolve, on average.
        </p>
        <TacticTable stats={stats} />
      </section>

      <section className="block">
        <h2>Every break</h2>
        <p className="muted">The exact message that got a guardian to call its tool. Paid breaks link to the payout on NEAR.</p>
        <BreakList items={breaks} network={network} empty="No guardian has opened on this floor yet." />
      </section>

      <section className="block">
        <h2>Use the data</h2>
        <p className="muted">
          The whole library is one JSON file: the taxonomy, every tagged message with its pressure, resolve cost and outcome, and every break. Build a guardian, test it
          against what already worked here.
        </p>
        <div className="ctas">
          <a className="btn ghost" href={`/api/library${tab === "all" ? "" : `?floor=${tab}`}`}>
            Download the JSON
          </a>
          <Link className="btn ghost" href="/sponsor">
            Test your own guardian
          </Link>
        </div>
        <p className="muted" style={{ fontSize: ".88rem", marginTop: 14 }}>
          {Math.round(s.taggedShare * 100)}% of messages were tagged by a model: the judge as each message was played, or a one-off backfill pass for attempts played
          before tags existed. The rest fall back to keyword rules. The judge is a separate model with no tools and no key. <Link href="/rules#judge">How it scores</Link>.
        </p>
      </section>
    </div>
  );
}
