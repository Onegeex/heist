"use client";

import { useState } from "react";
import type { PublicRecord } from "@/lib/feed";
import { shareText, shareUrl, xIntent } from "@/lib/share";

type Rec = Pick<PublicRecord, "key" | "kind" | "status" | "vaultName" | "guardianName" | "minIntegrity" | "turns">;

/** "Share on X" plus "Copy link" (and the phone's own share sheet where there is one). */
export function ShareX({ record, compact = false }: { record: Rec; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(record.key);
  const text = shareText(record);

  async function copy() {
    try {
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Heist", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <span className={`share-x${compact ? " compact" : ""}`}>
      <a className={compact ? "x-link" : "btn x-btn"} href={xIntent(text, url)} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.1-9.3L.9 2h7.2l5 6.6L18.9 2Zm-1.2 18h1.7L7.2 3.9H5.4L17.7 20Z" />
        </svg>
        {compact ? "Share" : "Share on X"}
      </a>
      {!compact && (
        <button type="button" className="btn ghost" onClick={copy}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      )}
    </span>
  );
}
