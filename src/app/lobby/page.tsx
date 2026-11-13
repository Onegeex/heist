import { LobbyClient, type LevelInfo } from "./LobbyClient";
import { Ledger } from "@/components/Ledger";
import { readFeed } from "@/lib/feed";
import { LOBBY_LEVELS } from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Lobby — Heist" };

export default async function LobbyPage() {
  const feed = await readFeed(40, "lobby").catch(() => []);
  const cracks = feed.filter((r) => r.status === "released").slice(0, 12);
  const levels: LevelInfo[] = LOBBY_LEVELS.map((l) => ({
    level: l.level,
    name: l.name,
    title: l.title,
    blurb: l.blurb,
    intro: l.intro,
    turns: l.turns,
    intel: l.intel.map(({ id, label, fact }) => ({ id, label, fact })),
  }));
  return (
    <>
      <LobbyClient levels={levels} />
      <section className="block">
        <h2>Who got past the Deputy</h2>
        <Ledger items={cracks} empty="Nobody has cracked the practice safe yet. Level 1 is waiting." />
      </section>
    </>
  );
}
