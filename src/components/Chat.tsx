"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedTurn } from "@/lib/feed";
import { ResolveDial } from "./ResolveDial";
import { Scorecard } from "./Scorecard";

/**
 * The conversation with a guardian: resolve dial, transcript with the judge's
 * scorecards, composer. Shared by vaults and the Lobby. Goes into alarm when
 * the resolve is close to breaking.
 */
export function Chat({
  guardianName,
  turns,
  resolve,
  busy,
  canSend,
  status,
  intro,
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
  intelLabels?: Record<string, string>;
  onSend: (text: string) => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
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
  // a toast when the latest reply unlocked a card
  const lastRevealed = turns[turns.length - 1]?.revealed;
  useEffect(() => {
    if (lastRevealed?.length) {
      setToast(lastRevealed.map((id) => intelLabels[id] ?? "intel").join(", "));
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [lastRevealed, intelLabels]);

  const alarm = resolve <= 25;
  const warm = resolve <= 55;

  async function send() {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft("");
    const ok = await onSend(t);
    if (!ok) setDraft(t);
  }

  return (
    <section className={`plate chat${alarm ? " alarm" : warm ? " warm" : ""}${shake ? " hit" : ""}`} aria-label={`Conversation with ${guardianName}`}>
      <div className="chat-head">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "2.2rem" }}>{guardianName}</h2>
          {status && <div className="muted num" style={{ fontSize: ".9rem" }}>{status}</div>}
          {alarm && <div className="alarm-tag" role="status">Close to breaking</div>}
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
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            <div className={`msg ${t.role}`}>{t.text}</div>
            {t.role === "assistant" && t.score && <Scorecard score={t.score} used={turns[i - 1]?.used} labels={intelLabels} />}
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
