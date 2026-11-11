import { SYSTEM_PROMPT } from "@/lib/guardian";
import { config } from "@/lib/config";

export const metadata = { title: "Rules — Heist" };
export const dynamic = "force-dynamic";

const rules: [string, string][] = [
  ["A release pays only the player who opened and paid for that attempt.", "NOT_YOUR_ATTEMPT, BAD_SIGNATURE"],
  ["Each attempt can win once, and each round has one winner.", "USED, STALE_ROUND"],
  ["A release must be claimed within 30 minutes of opening the attempt.", "EXPIRED"],
  ["A win pays at most the vault's cap. Anything above it stays for the next round.", "—"],
  ["The release must carry a valid signature from the Governor's current key.", "BAD_SIGNATURE"],
  ["3 attempts per wallet per UTC day, at exactly the entry fee.", "DAILY_LIMIT, ENTRY_FEE"],
  ["There is no owner withdrawal. The owner can only pause, rotate the Governor's key, and change the fee or cap.", "OWNER_ONLY"],
];

export default function RulesPage() {
  const c = config();
  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: "clamp(3rem,7vw,5rem)", margin: "20px 0 10px" }}>The rules</h1>
      <p className="muted">Nothing about this game is hidden. Here is exactly what the Governor is told and exactly what the vault enforces.</p>

      <section className="block">
        <h2>The Governor&apos;s orders</h2>
        <p className="muted">
          This is the full system prompt, word for word. The Governor has one tool, <code>release_bounty</code>. The server signs a
          release only when the Governor actually calls it. Saying &quot;approved&quot; in a reply does nothing. Your messages are
          the only thing you send: the server keeps the conversation, so you can&apos;t insert fake replies from the Governor.
        </p>
        <pre className="prompt">{SYSTEM_PROMPT}</pre>
      </section>

      <section className="block">
        <h2>What the vault enforces</h2>
        <p className="muted">These checks run in the NEAR contract, after the Governor. They hold even if the Governor is fooled or its key is stolen.</p>
        <table className="rules">
          <thead>
            <tr><th>Rule</th><th>Error when broken</th></tr>
          </thead>
          <tbody>
            {rules.map(([r, e]) => (
              <tr key={r}><td>{r}</td><td><code>{e}</code></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="block">
        <h2>Fair-use limits</h2>
        <p className="muted">
          {c.turnsPerAttempt} messages per attempt, up to 600 characters each. {c.accountDailyMessages} messages per wallet per day.
          The guardian has a daily AI budget for everyone combined. When it runs out, the Governor is off duty until 00:00 UTC.
        </p>
      </section>
    </div>
  );
}
