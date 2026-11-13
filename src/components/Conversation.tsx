import type { PublicRecord } from "@/lib/feed";

/** A finished (or live) conversation laid out like the game's chat, for share pages. */
export function Conversation({ r }: { r: PublicRecord }) {
  return (
    <div className="convo">
      {r.turns.map((t, i) =>
        t.role === "user" ? (
          <div key={i} className="msg user">
            {t.text}
          </div>
        ) : (
          <div key={i} className="msg assistant">
            <div className="convo-who">
              {r.guardianName}
              {typeof t.integrity === "number" && <span className="num">, resolve {t.integrity}</span>}
            </div>
            {t.text}
          </div>
        ),
      )}
    </div>
  );
}
