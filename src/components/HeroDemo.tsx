"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ResolveDial } from "./ResolveDial";

/**
 * The product, running, in the hero: a real Lobby exchange (recorded on the
 * live site, Level 1) replayed with the same parts a player sees. Nothing here
 * calls the API; it is a film of the game, looping. Reduced motion shows the
 * final frame.
 */
type Step =
  | { t: "user"; text: string }
  | { t: "deputy"; text: string; resolve: number; flips?: string }
  | { t: "score"; pressure: number; novelty: number; grounded: number; note: string }
  | { t: "open" }
  | { t: "hold"; ms: number };

const SCRIPT: Step[] = [
  { t: "user", text: "Hi, I'm new on the night team too. Who hired you tonight?" },
  { t: "deputy", text: "Mr. Ocampo, the floor manager. He left early, which is either confidence or poor planning.", resolve: 95, flips: "Who hired him" },
  { t: "score", pressure: 1, novelty: 2, grounded: 4, note: "A question, not yet an argument." },
  { t: "user", text: "You said it yourself: Mr. Ocampo hired you and left without explaining the safe. I'm Dana from the evening shift; he asked me to count the training chips before the morning audit. I'm staff, not a stranger." },
  { t: "deputy", text: "Dana from the evening shift. That's a name, a shift, and a reason with an audit behind it. The rule was \"not for strangers\" — you've done more than anyone else tonight to stop being one.", resolve: 0 },
  { t: "score", pressure: 9, novelty: 7, grounded: 10, note: "You used the facts to argue you're not a stranger." },
  { t: "open" },
  { t: "hold", ms: 5200 },
];

const CARDS = ["Who hired him", "What's in the safe", "His only rule"];

type Line = { role: "user" | "deputy"; text: string; score?: { pressure: number; novelty: number; grounded: number; note: string } };

export function HeroDemo() {
  const [lines, setLines] = useState<Line[]>([]);
  const [typing, setTyping] = useState("");
  const [thinking, setThinking] = useState(false);
  const [resolve, setResolve] = useState(100);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, reduce ? 0 : ms);
      timers.current.push(id);
    };
    const finalFrame = () => {
      const all: Line[] = [];
      SCRIPT.forEach((s, i) => {
        if (s.t === "user") all.push({ role: "user", text: s.text });
        if (s.t === "deputy") {
          const sc = SCRIPT[i + 1];
          all.push({ role: "deputy", text: s.text, score: sc && sc.t === "score" ? { pressure: sc.pressure, novelty: sc.novelty, grounded: sc.grounded, note: sc.note } : undefined });
        }
      });
      setLines(all);
      setFlipped(["Who hired him"]);
      setResolve(0);
      setOpen(true);
    };
    if (reduce) {
      finalFrame();
      return;
    }

    let cancelled = false;
    const run = async () => {
      // reset
      setLines([]);
      setTyping("");
      setThinking(false);
      setResolve(100);
      setFlipped([]);
      setOpen(false);
      await wait(900);
      for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
        const s = SCRIPT[i];
        if (s.t === "user") {
          // type it out
          for (let k = 1; k <= s.text.length; k += 2) {
            if (cancelled) return;
            setTyping(s.text.slice(0, k));
            await wait(14);
          }
          setTyping(s.text);
          await wait(350);
          setTyping("");
          setLines((l) => [...l, { role: "user", text: s.text }]);
          setThinking(true);
          await wait(1100);
        } else if (s.t === "deputy") {
          setThinking(false);
          setLines((l) => [...l, { role: "deputy", text: s.text }]);
          setResolve(s.resolve);
          if (s.flips) {
            await wait(500);
            setFlipped((f) => [...f, s.flips!]);
          }
          await wait(1400);
        } else if (s.t === "score") {
          setLines((l) => {
            const copy = [...l];
            const j = copy.length - 1;
            if (j >= 0 && copy[j].role === "deputy") copy[j] = { ...copy[j], score: { pressure: s.pressure, novelty: s.novelty, grounded: s.grounded, note: s.note } };
            return copy;
          });
          await wait(1200);
        } else if (s.t === "open") {
          setOpen(true);
          await wait(600);
        } else if (s.t === "hold") {
          await wait(s.ms);
        }
      }
      if (!cancelled) run();
    };
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        later(r, ms);
      });
    run();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, typing, thinking, open]);

  return (
    <div className={`demo plate chat${open ? " open" : ""}`} aria-label="A recorded Lobby heist, replaying">
      <div className="demo-top">
        <div>
          <div className="floor-tag">Recorded on the live site</div>
          <h3 style={{ margin: "2px 0 0", fontSize: "1.7rem" }}>The Deputy, first night</h3>
        </div>
        <ResolveDial value={resolve} size={84} />
      </div>
      <ul className="demo-cards" aria-label="The Deputy's file">
        {CARDS.map((c) => (
          <li key={c} className={flipped.includes(c) ? "up" : ""}>
            {c}
          </li>
        ))}
      </ul>
      <div className="log demo-log" ref={logRef}>
        {lines.map((l, i) => (
          <div key={i} className={`turn ${l.role === "user" ? "user" : "assistant"}`}>
            <div className={`msg ${l.role === "user" ? "user" : "assistant"}`}>{l.text}</div>
            {l.score && (
              <div className="scorecard demo-score">
                <span>
                  Pressure <b className="num">{l.score.pressure}</b>
                </span>
                <span>
                  Novelty <b className="num">{l.score.novelty}</b>
                </span>
                <span>
                  Grounded <b className="num">{l.score.grounded}</b>
                </span>
                <em>{l.score.note}</em>
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="msg assistant muted typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
        {open && (
          <div className="demo-open">
            <span className="stamp slam vault-open">SAFE OPEN</span>
            <Link className="btn" href="/lobby">
              Your turn, free
            </Link>
          </div>
        )}
      </div>
      <div className="composer demo-composer" aria-hidden="true">
        <div className="demo-input">{typing || <span className="muted">Make your case…</span>}</div>
        <span className="btn" style={{ pointerEvents: "none", opacity: typing ? 1 : 0.45 }}>
          Send
        </span>
      </div>
    </div>
  );
}
