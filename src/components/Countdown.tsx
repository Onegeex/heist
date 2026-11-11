"use client";

import { useEffect, useState } from "react";

/** Live countdown to a timestamp. Shows "Not started" before the round's first attempt. */
export function Countdown({ endsAt, idleLabel = "Starts with the first attempt" }: { endsAt: number | null; idleLabel?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return <span className="muted">{idleLabel}</span>;
  const ms = endsAt - now;
  if (ms <= 0) return <span style={{ color: "var(--alarm)", fontWeight: 700 }}>Run out: the last challenger can collect</span>;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="num" style={{ fontWeight: 700 }}>
      {h}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
