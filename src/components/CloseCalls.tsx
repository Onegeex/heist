import Link from "next/link";
import type { PublicRecord } from "@/lib/feed";
import { ago, shortAccount } from "@/lib/format";

/** The attempts that got nearest to opening a door, as a strip of cards with the line that cut deepest. */
export function CloseCalls({ items }: { items: PublicRecord[] }) {
  if (!items.length) return null;
  return (
    <ul className="close-calls" aria-label="Closest calls">
      {items.map((r) => {
        let best = 0;
        let lowest = 101;
        r.turns.forEach((t, i) => {
          if (t.role === "assistant" && (t.integrity ?? 100) < lowest) {
            lowest = t.integrity ?? 100;
            best = i;
          }
        });
        const line = r.turns[best - 1]?.text ?? r.turns[0]?.text ?? "";
        const hot = r.minIntegrity <= 25;
        return (
          <li key={r.key} className={`close-call${hot ? " hot" : ""}`}>
            <Link href={`/share/${encodeURIComponent(r.key)}`}>
              <span className="ring num" style={{ ["--p" as string]: `${100 - r.minIntegrity}%` }}>
                <b>{r.minIntegrity}</b>
              </span>
              <span className="cc-text">
                <b className="who">{shortAccount(r.player)}</b>
                <small className="muted">
                  {r.vaultName}, {ago(r.startedAt)}
                </small>
                <q>{line.length > 110 ? line.slice(0, 110) + "…" : line}</q>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
