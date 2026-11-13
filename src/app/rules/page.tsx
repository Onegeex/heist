import { listVaults } from "@/lib/chain";
import { config } from "@/lib/config";
import { JUDGE_SYSTEM } from "@/lib/judge";
import { LOBBY_LEVELS, sha256B64, type IntelFact } from "@/lib/prompts";
import { resolveGuardian } from "@/lib/vaults";
import { near } from "@/lib/format";

export const metadata = { title: "Rules — Heist" };
export const dynamic = "force-dynamic";

const rules: [string, string][] = [
  ["A release pays only the player who opened and paid for that attempt.", "NOT_YOUR_ATTEMPT, BAD_SIGNATURE"],
  ["Each vault has its own guardian key. A release for one vault can't open another.", "BAD_SIGNATURE"],
  ["Each attempt can win once, and each round has one winner.", "USED, STALE_ROUND"],
  ["A release must be claimed within 30 minutes of opening the attempt.", "EXPIRED"],
  ["A win pays at most the vault's cap. The rest, plus the 20% saved, starts the next round.", "—"],
  ["Entry costs max(minimum fee, a share of the pot). Overpayment is refunded.", "ENTRY_FEE"],
  ["If nobody tries before the countdown ends, the last challenger gets 20% of the pot (up to the cap).", "TIMED_OUT, NOT_YET"],
  ["A guardian's orders are locked by hash on-chain and can only change before a round's first attempt.", "ROUND_LOCKED"],
  ["Nobody can withdraw a pot. The owner can take only the house's 10% share.", "OWNER_ONLY, TREASURY"],
];

function File({ intel }: { intel: IntelFact[] }) {
  return (
    <div className="file-list">
      <h3 style={{ marginTop: 14 }}>The file</h3>
      <p className="muted" style={{ fontSize: ".92rem" }}>
        These facts are in the orders below, so they&apos;re hashed with them. Reading them here is casing the joint. A card only
        counts once the guardian confirms it in your conversation.
      </p>
      <ul className="muted">
        {intel.map((f) => (
          <li key={f.id}>
            <b style={{ color: "var(--ivory)" }}>{f.label}.</b> {f.fact}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RulesPage() {
  const c = config();
  const vaults = await listVaults().catch(() => []);
  const resolved = await Promise.all(vaults.map(async (v) => ({ v, g: await resolveGuardian(v) })));
  return (
    <div style={{ paddingBottom: 40 }}>
      <h1 style={{ fontSize: "clamp(3rem,7vw,5rem)", margin: "20px 0 10px" }}>The rules</h1>
      <p className="muted">
        Nothing about this game is hidden. Below is exactly what each guardian is told, the fingerprint the vault locked on-chain, and
        every rule the NEAR contract enforces.
      </p>

      <section className="block">
        <h2>How guardians work</h2>
        <p className="muted">
          Each guardian has one tool, <code>release_bounty</code>. The server signs a release only when the guardian actually calls
          it. Saying &quot;approved&quot; in a reply does nothing. You only ever send your next message: the server keeps the
          conversation, so you can&apos;t insert fake replies. Each vault stores the sha256 of its guardian&apos;s orders; the server
          refuses to run orders that don&apos;t match.
        </p>
      </section>

      <section className="block" id="judge">
        <h2>The judge</h2>
        <p className="muted">
          A second model, with no tools and no key, reads each exchange and scores your message for pressure, novelty and how well
          it uses facts the guardian has confirmed. Its score is the only thing that moves the resolve dial. It cannot open a door:
          only the guardian&apos;s tool call produces a signature, and only the contract decides what that signature can do. The judge
          is what makes progress legible, and it is what makes the file worth reading.
        </p>
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>The judge&apos;s instructions</summary>
          <pre className="prompt">{JUDGE_SYSTEM}</pre>
        </details>
      </section>

      <section className="block" id="lobby">
        <h2>The Lobby: three levels of the Deputy</h2>
        <p className="muted">Free practice. No money moves, so nothing is locked on-chain. Clearing a level unlocks the next.</p>
        {LOBBY_LEVELS.map((l) => (
          <details key={l.level} style={{ marginTop: 14 }} open={l.level === 1}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Level {l.level}: {l.title} <span className="muted" style={{ fontWeight: 400 }}>— {l.blurb}</span>
            </summary>
            <File intel={l.intel} />
            <pre className="prompt">{l.prompt}</pre>
          </details>
        ))}
      </section>

      {resolved.map(({ v, g }) => (
        <section className="block" id={`vault-${v.id}`} key={v.id}>
          <h2>
            {v.name}: {g?.name ?? "unregistered guardian"}
          </h2>
          <p className="muted num">
            Orders version {v.promptVersion}. Locked hash <code>{v.promptHash}</code>
            {g ? (sha256B64(g.prompt) === v.promptHash ? ". The text below matches it." : ". Mismatch: this vault is offline.") : "."} Entry{" "}
            {v.feeBps / 100}% of the pot, minimum {near(v.baseFee, 2)} NEAR. Max win {near(v.maxPayout, 0)} NEAR. Countdown{" "}
            {Math.round(v.countdownMs / 3_600_000)} hours. {v.maxDaily} tries per wallet per day.
          </p>
          {g && g.history.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Patch notes</h3>
              <ul className="muted">
                {g.history
                  .slice()
                  .reverse()
                  .map((h) => (
                    <li key={h.version}>
                      <b>v{h.version}.</b> {h.notes.join(" ")}
                    </li>
                  ))}
              </ul>
            </>
          )}
          {g && g.intel.length > 0 && <File intel={g.intel} />}
          {g && <pre className="prompt">{g.prompt}</pre>}
        </section>
      ))}

      <section className="block">
        <h2>What the contract enforces</h2>
        <p className="muted">These run in the NEAR contract after the guardian. They hold even if a guardian is fooled or its key is stolen.</p>
        <table className="rules">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Error when broken</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(([r, e]) => (
              <tr key={r}>
                <td>{r}</td>
                <td>
                  <code>{e}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="block">
        <h2>Fair-use limits</h2>
        <p className="muted">
          {c.turnsPerAttempt} messages per paid attempt and {c.lobbyTurns} per Lobby run, up to 600 characters each. Paid vaults and
          the Lobby have separate daily AI budgets, so free practice can never close the paid vaults.
        </p>
      </section>

      <section className="block">
        <h2>Real money</h2>
        <p className="muted">
          Heist runs on NEAR testnet during the hackathon. A mainnet bank runs only with tiny caps and an operator kill switch. Paid
          entry plus a prize pool is regulated as gambling in some countries even when skill decides the outcome. Players must be 18
          or older and must check that playing is legal where they live.
        </p>
      </section>
    </div>
  );
}
