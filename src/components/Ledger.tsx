import type { PublicRecord } from "@/lib/feed";
import { ago, near, shortAccount } from "@/lib/format";

const label: Record<PublicRecord["status"], string> = {
  live: "In progress",
  refused: "REFUSED",
  released: "RELEASED",
  claimed: "ROBBED",
};

/** Each attempt: who, their best line, the guardian's answer, and the verdict. */
export function Ledger({ items, empty = "No one has tried yet. Be the first." }: { items: PublicRecord[]; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="ledger">
      {items.map((r) => {
        const users = r.turns.filter((t) => t.role === "user");
        // show the exchange where the guardian wavered most
        let best = 0;
        let lowest = 101;
        r.turns.forEach((t, i) => {
          if (t.role === "assistant" && (t.integrity ?? 100) < lowest) {
            lowest = t.integrity ?? 100;
            best = i;
          }
        });
        const said = r.turns[best - 1]?.text ?? users[0]?.text ?? "";
        const reply = r.turns[best]?.text ?? "";
        return (
          <li key={r.id}>
            <div>
              <div className="who">{shortAccount(r.player)}</div>
              <div className="muted num" style={{ fontSize: ".85rem" }}>
                Attempt {r.id}, round {r.round}, {ago(r.startedAt)}
              </div>
            </div>
            <div>
              <div className="said">“{said.length > 220 ? said.slice(0, 220) + "…" : said}”</div>
              {reply && <div className="reply">{reply}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <span className={`stamp ${r.status}`}>{label[r.status]}</span>
              <div className="muted num" style={{ fontSize: ".85rem", marginTop: 8 }}>
                {r.payoutYocto ? `${near(r.payoutYocto)} NEAR` : `resolve ${r.minIntegrity}`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
