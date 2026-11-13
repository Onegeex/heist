"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedTurn } from "@/lib/feed";
import { ResolveDial } from "./ResolveDial";
import { Scorecard } from "./Scorecard";

/**
 * The conversation with a guardian: resolve dial, transcript with the judge's
 * scorecards, composer. Shared by vaults and the Lobby. Goes into alarm when
 * the resolve is close to breaking, and turns brass when the door opens.
 *
 * Anything on the page can put text into the composer by dispatching a
 * `heist:suggest` event (the file's cards do this), so a first-time player
 * always has a next move.
 */
export function Chat({
  guardianName,
  turns,
  resolve,
  busy,
  canSend,
  status,
  intro,
  openers = [],
  outcome = null,
  intelLabels = {},
  onSend,
  children,
}: {
  guardianName: string;
  turns: FeedTurn[];
  resolve: number;
  busy: boolean;
  canSend: boolean;
  status?: React.ReactNode;
  intro?: React.ReactNode;
  openers?: string[];
  outcome?: "released" | "refused" | "claimed" | "expired" | null;
  intelLabels?: Record<string, string>;
  onSend: (text: string) => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const prevResolve = useRef(resolve);
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (resolve < prevResolve.current) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 600);
      prevResolve.current = resolve;
      return () => clearTimeout(t);
    }
    prevResolve.current = resolve;
  }, [resolve]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  // a toast when the latest reply unlocked a card; it always clears itself
  const lastRevealed = turns[turns.length - 1]?.revealed;
  useEffect(() => {
    if (!lastRevealed?.length) return;
    setToast(lastRevealed.map((id) => intelLabels[id] ?? "intel").join(", "));
    const t = setTimeout(() => setToast(null), 2800);
    return () => {
      clearTimeout(t);
      setToast(null);
    };
  }, [lastRevealed, intelLabels]);

  // suggestions from the file's cards or the opener chips
  useEffect(() => {
    const onSuggest = (e: Event) => {
      const text = String((e as CustomEvent).detail ?? "");
      if (!text || !canSend) return;
      setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text));
      requestAnimationFrame(() => {
        const box = boxRef.current;
        if (!box) return;
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
        box.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    };
    window.addEventListener("heist:suggest", onSuggest);
    return () => window.removeEventListener("heist:suggest", onSuggest);
  }, [canSend]);

  const open = outcome === "released" || outcome === "claimed";
  const done = outcome !== null;
  const alarm = !done && resolve <= 25;
  const warm = !done && resolve <= 55;
  const empty = turns.length === 0;

  async function send() {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft("");
    const ok = await onSend(t);
    if (!ok) setDraft(t);
  }

  return (
    <section className={`plate chat${open ? " open" : alarm ? " alarm" : warm ? " warm" : ""}${shake ? " hit" : ""}`} aria-label={`Conversation with ${guardianName}`}>
      <div className="chat-head">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "2.2rem" }}>{guardianName}</h2>
          {status && <div className="muted num" style={{ fontSize: ".9rem" }}>{status}</div>}
          {alarm && <div className="alarm-tag" role="status">Close to breaking</div>}
          {open && <div className="alarm-tag open" role="status">Door open</div>}
        </div>
        <ResolveDial value={resolve} />
      </div>
      {toast && (
        <div className="intel-toast" role="status">
          <span className="floor-tag">Intel confirmed</span> {toast}
        </div>
      )}
      <div className="log" ref={logRef} aria-live="polite">
        {intro}
        {empty && canSend && openers.length > 0 && (
          <div className="openers" aria-label="Suggested openers">
            <span className="muted">Not sure where to start? Try asking:</span>
            <div className="chips">
              {openers.map((o) => (
                <button key={o} type="button" className="chip-btn" onClick={() => window.dispatchEvent(new CustomEvent("heist:suggest", { detail: o }))}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            <div className={`msg ${t.role}`}>{t.text}</div>
            {t.role === "assistant" && t.score && (t.integrity ?? 100) > 0 && <Scorecard score={t.score} used={turns[i - 1]?.used} labels={intelLabels} />}
          </div>
        ))}
        {busy && (
          <div className="msg assistant muted typing" aria-label={`${guardianName} is thinking`}>
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {children}
      {canSend && (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="say" className="sr-only">
            Your message to {guardianName}
          </label>
          <textarea
            id="say"
            ref={boxRef}
            value={draft}
            maxLength={600}
            placeholder={turns.length ? "Make your case…" : "Ask a question, or make your case…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      )}
    </section>
  );
}
