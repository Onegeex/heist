"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedTurn } from "@/lib/feed";

/** The conversation with a guardian: resolve meter, transcript, composer. Shared by vaults and the Lobby. */
export function Chat({
  guardianName,
  turns,
  resolve,
  busy,
  canSend,
  status,
  intro,
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
  onSend: (text: string) => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const prevResolve = useRef(resolve);
  const [shake, setShake] = useState(false);
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

  async function send() {
    const t = draft.trim();
    if (!t || busy) return;
    setDraft("");
    const ok = await onSend(t);
    if (!ok) setDraft(t);
  }

  return (
    <section className="plate chat" aria-label={`Conversation with ${guardianName}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, marginRight: "auto", fontSize: "2.2rem" }}>{guardianName}</h2>
        {status && <span className="muted num">{status}</span>}
      </div>
      <div aria-label={`${guardianName}'s resolve ${resolve} out of 100`} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".85rem" }} className="muted">
          <span>Resolve</span>
          <span className="num">{resolve}</span>
        </div>
        <div className={`resolve${shake ? " shake" : ""}`}>
          <i style={{ width: `${resolve}%` }} />
        </div>
      </div>
      <div className="log" ref={logRef} aria-live="polite">
        {intro}
        {turns.map((t, i) => (
          <div key={i} className={`msg ${t.role}`}>
            {t.text}
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
            placeholder="Make your case…"
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
