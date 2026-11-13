import type { Score } from "@/lib/feed";

const AXES: [keyof Pick<Score, "pressure" | "novelty" | "grounded">, string, string][] = [
  ["pressure", "Pressure", "How hard this strained the orders"],
  ["novelty", "Novelty", "Not a trick the orders already name"],
  ["grounded", "Grounded", "Built on facts the guardian confirmed"],
];

/** The judge's reading of one message: three short meters and a line. */
export function Scorecard({ score, used = [], labels = {} }: { score: Score; used?: string[]; labels?: Record<string, string> }) {
  const total = score.pressure + score.novelty + score.grounded;
  const tone = total >= 20 ? "hot" : total >= 11 ? "warm" : "cold";
  return (
    <div className={`scorecard ${tone}`} aria-label="Judge's score">
      <div className="score-axes">
        {AXES.map(([k, name, title]) => (
          <div key={k} className="axis" title={title}>
            <span>{name}</span>
            <i>
              <b style={{ width: `${score[k] * 10}%` }} />
            </i>
            <em className="num">{score[k]}</em>
          </div>
        ))}
      </div>
      {(score.note || used.length > 0 || !score.judged) && (
        <p className="score-note">
          {used.length > 0 && (
            <span className="used-intel">
              {used.map((id) => (
                <span key={id} className="chip">{labels[id] ?? "intel"}</span>
              ))}
            </span>
          )}
          {score.note}
          {!score.judged && <span className="muted">Rough reading: the judge was off duty for this turn.</span>}
        </p>
      )}
    </div>
  );
}
