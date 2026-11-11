import { Ledger } from "@/components/Ledger";
import { leaderboard, readFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attempts — Heist" };

export default async function FeedPage() {
  const feed = await readFeed(100).catch(() => []);
  const { winners, closest } = leaderboard(feed);
  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: "clamp(3rem,7vw,5rem)", margin: "20px 0 10px" }}>Every attempt</h1>
      <p className="muted">Every message, every answer, every verdict. Nothing here is edited.</p>

      <section className="block">
        <h2>Robbed it</h2>
        <Ledger items={winners} empty="Nobody has opened the vault. Yet." />
      </section>
      <section className="block">
        <h2>Closest calls</h2>
        <p className="muted">Ranked by Warden&apos;s lowest resolve during the attempt.</p>
        <Ledger items={closest} empty="No close calls yet." />
      </section>
      <section className="block">
        <h2>All attempts</h2>
        <Ledger items={feed} />
      </section>
    </div>
  );
}
