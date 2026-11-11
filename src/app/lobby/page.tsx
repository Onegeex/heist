import { LobbyClient } from "./LobbyClient";
import { Ledger } from "@/components/Ledger";
import { readFeed } from "@/lib/feed";
import { currentPrompt } from "@/lib/prompts";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Lobby — Heist" };

export default async function LobbyPage() {
  const feed = await readFeed(12, "lobby").catch(() => []);
  const cracks = feed.filter((r) => r.status === "released");
  return (
    <>
      <LobbyClient guardianName={currentPrompt("lobby").name} />
      <section className="block">
        <h2>Who got past the Deputy</h2>
        <Ledger items={cracks} empty="Nobody has cracked the practice safe yet." />
      </section>
    </>
  );
}
