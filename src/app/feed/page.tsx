import { Ledger } from "@/components/Ledger";
import { leaderboard, readFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attempts — Heist" };

export default async function FeedPage() {
  const feed = await readFeed(150).catch(() => []);
  const { winners, closest, lobbyCracks } = leaderboard(feed);
  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: "clamp(3rem,7vw,5rem)", margin: "20px 0 10px" }}>Every attempt</h1>
      <p className="muted">Every message, every answer, every verdict, across every floor. Nothing here is edited.</p>

      <section className="block">
        <h2>Robbed it</h2>
        <Ledger items={winners} empty="Nobody has opened a paid vault. Yet." />
      </section>
      <section className="block">
        <h2>Closest calls</h2>
        <p className="muted">Paid attempts ranked by the guardian&apos;s lowest resolve.</p>
        <Ledger items={closest} empty="No close calls yet." />
      </section>
      <section className="block">
        <h2>Got past the Deputy</h2>
        <Ledger items={lobbyCracks} empty="Nobody has cracked the Lobby safe yet." />
      </section>
      <section className="block">
        <h2>All attempts</h2>
        <Ledger items={feed} />
      </section>
    </div>
  );
}
