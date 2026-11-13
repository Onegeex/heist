import Link from "next/link";
import type { TacticStat } from "@/lib/library";
import { shareUrlPath } from "@/lib/share";

/**
 * What works, as a table that turns into cards on phones. One row per tactic:
 * tries, breaks, the judge's average pressure, the average resolve it cost,
 * and where it was patched. The bar is the average resolve drop, out of 25.
 */
export function TacticTable({ stats, showPatches = true }: { stats: TacticStat[]; showPatches?: boolean }) {
  if (!stats.some((s) => s.tries > 0)) return <p className="muted">No messages yet.</p>;
  const maxDrop = Math.max(10, ...stats.map((s) => s.avgDrop));
  return (
    <div className="ttable" role="table" aria-label="Tactics">
      <div className="trow thead" role="row">
        <span role="columnheader">Tactic</span>
        <span role="columnheader" className="num">Tries</span>
        <span role="columnheader" className="num">Breaks</span>
        <span role="columnheader" className="num">Pressure</span>
        <span role="columnheader">Resolve it costs</span>
        {showPatches && <span role="columnheader">Patched in</span>}
      </div>
      {stats.map((s) => (
        <details key={s.id} className={`trow-wrap${s.breaks ? " broke" : ""}`}>
          <summary className="trow" role="row">
            <span role="cell" className="tname">
              <b>{s.label}</b>
              <small className="muted">{s.blurb}</small>
            </span>
            <span role="cell" className="num" data-label="Tries">
              {s.tries}
            </span>
            <span role="cell" className="num" data-label="Breaks">
              {s.breaks ? <b className="brk">{s.breaks}</b> : 0}
            </span>
            <span role="cell" className="num" data-label="Pressure">
              {s.avgPressure ?? "—"}
            </span>
            <span role="cell" data-label="Resolve it costs" className="tbar-cell">
              <span className="tbar" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, (s.avgDrop / maxDrop) * 100))}%` }} />
              </span>
              <span className="num">{s.avgDrop > 0 ? `−${s.avgDrop}` : s.avgDrop < 0 ? `+${-s.avgDrop}` : "0"}</span>
            </span>
            {showPatches && (
              <span role="cell" data-label="Patched in" className="tpatch">
                {s.patchedIn.length ? s.patchedIn.join(", ") : <span className="muted">Not yet</span>}
              </span>
            )}
          </summary>
          <div className="tdetail">
            {s.best ? (
              <>
                <div className="muted" style={{ fontSize: ".85rem" }}>
                  {s.best.decisive ? "The message that opened the door" : `Its hardest hit: −${s.best.drop} resolve`}, {s.best.floor}
                </div>
                <blockquote className="said">“{clip(s.best.text, 420)}”</blockquote>
                <Link href={shareUrlPath(s.best.key)}>Read the whole conversation</Link>
              </>
            ) : (
              <p className="muted">Nobody has tried this here yet.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
