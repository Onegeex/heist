"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type IntelCard = { id: string; label: string; fact: string; ask?: string };

/** Puts text into the composer of the chat on this page (see Chat). */
export function suggest(text: string) {
  window.dispatchEvent(new CustomEvent("heist:suggest", { detail: text }));
}

/**
 * The guardian's file as cards. A card is face-down until the guardian
 * confirms the fact in conversation; then it flips. A card the player has
 * cited correctly gets a brass mark. The whole file is public on the rules
 * page; the cards track what this conversation has earned.
 *
 * Cards are buttons: a face-down card drops its question into the composer,
 * a face-up card drops the fact in, ready to be used.
 */
export function Dossier({ intel, held, used, rulesHref, compact = false, canAsk = true }: { intel: IntelCard[]; held: string[]; used: string[]; rulesHref?: string; compact?: boolean; canAsk?: boolean }) {
  const [fresh, setFresh] = useState<string[]>([]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const now = held.filter((id) => !seen.current.has(id));
    held.forEach((id) => seen.current.add(id));
    if (now.length) {
      setFresh(now);
      const t = setTimeout(() => setFresh([]), 1600);
      return () => clearTimeout(t);
    }
  }, [held]);
  if (!intel.length) return null;
  const heldSet = new Set(held);
  const usedSet = new Set(used);
  return (
    <div className={`dossier${compact ? " compact" : ""}`}>
      <div className="dossier-head">
        <span className="floor-tag">The file</span>
        <span className="muted num" style={{ fontSize: ".85rem" }}>{held.length}/{intel.length} confirmed</span>
      </div>
      <ul className="cards">
        {intel.map((c) => {
          const isHeld = heldSet.has(c.id);
          const isUsed = usedSet.has(c.id);
          const action = !canAsk ? undefined : isHeld ? () => suggest(`You said it yourself: ${c.fact.charAt(0).toLowerCase()}${c.fact.slice(1)} `) : c.ask ? () => suggest(c.ask!) : undefined;
          const Tag = action ? "button" : "div";
          return (
            <li key={c.id} className={`card${isHeld ? " up" : ""}${fresh.includes(c.id) ? " fresh" : ""}${isUsed ? " used" : ""}`}>
              <Tag
                className="card-inner"
                {...(action ? { type: "button", onClick: action, "aria-label": isHeld ? `${c.label}: ${c.fact}. Put this fact in your message.` : `${c.label}: not yet confirmed. Ask about it.` } : {})}
              >
                <div className="face back">
                  <span className="card-label">{c.label}</span>
                  <span className="card-hint">{action ? "Tap to ask about it" : `Get ${compact ? "them" : "the guardian"} to say it`}</span>
                </div>
                <div className="face front">
                  <span className="card-label">{c.label}</span>
                  <span className="card-fact">{c.fact}</span>
                  {isUsed ? <span className="card-used">Used</span> : action ? <span className="card-hint">Tap to use it</span> : null}
                </div>
              </Tag>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <p className="muted" style={{ fontSize: ".82rem", margin: "8px 0 0" }}>
          A confirmed fact used well is what moves the needle. {rulesHref && <Link href={rulesHref}>Read the whole file</Link>}
        </p>
      )}
    </div>
  );
}
