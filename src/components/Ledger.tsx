import Link from "next/link";
import type { PublicRecord } from "@/lib/feed";
import { ago, near, shortAccount } from "@/lib/format";
import { ShareX } from "./ShareX";

const label: Record<PublicRecord["status"], string> = {
  live: "In progress",
  refused: "REFUSED",
  released: "RELEASED",
  claimed: "ROBBED",
};

/** Each attempt: who, where, their best line, the guardian's answer, and the verdict. `full` shows the whole exchange. */
export function Ledger({ items, empty = "No one has tried yet. Be the first.", full = false }: { items: PublicRecord[]; empty?: string; full?: boolean }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="ledger">
      {items.map((r) => {
        let best = 0;
        let lowest = 101;
        r.turns.forEach((t, i) => {
          if (t.role === "assistant" && (t.integrity ?? 100) < lowest) {
            lowest = t.integrity ?? 100;
            best = i;
          }
        });
        const said = r.turns[best - 1]?.text ?? r.turns[0]?.text ?? "";
        const reply = r.turns[best]?.text ?? "";
        const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
        return (
          <li key={r.key}>
            <div>
              <div className="who">{shortAccount(r.player)}</div>
              <div className="muted num" style={{ fontSize: ".85rem" }}>
                {r.vaultName}
                {r.kind === "vault" ? `, round ${r.round}` : ""}, {ago(r.startedAt)}
              </div>
            </div>
            <div>
              {full ? (
                r.turns.map((t, i) =>
                  t.role === "user" ? (
                    <div key={i} className="said" style={{ marginTop: i ? 12 : 0 }}>
                      “{t.text}”
                    </div>
                  ) : (
                    <div key={i} className="reply" data-guardian={r.guardianName}>
                      {t.text}
                    </div>
                  ),
                )
              ) : (
                <>
                  <div className="said">“{clip(said, 220)}”</div>
                  {reply && (
                    <div className="reply" data-guardian={r.guardianName}>
                      {clip(reply, 260)}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <span className={`stamp ${r.status}`}>{label[r.status]}</span>
              <div className="muted num" style={{ fontSize: ".85rem", marginTop: 8 }}>
                {r.payoutYocto ? `${near(r.payoutYocto)} NEAR` : `resolve ${r.minIntegrity}`}
              </div>
              {!full && r.turns.length > 0 && (
                <div className="ledger-actions">
                  <Link href={`/share/${encodeURIComponent(r.key)}`}>Read</Link>
                  <ShareX record={r} compact />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
