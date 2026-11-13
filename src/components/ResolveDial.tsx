"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The guardian's resolve as a combination dial. The ring turns one notch for
 * every point lost, the index stays put, and the lamp goes red when the door
 * is close to giving. Reads as a number for screen readers.
 */
export function ResolveDial({ value, label = "Resolve", size = 112 }: { value: number; label?: string; size?: number }) {
  const prev = useRef(value);
  const [kick, setKick] = useState<"down" | "up" | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setKick(value < prev.current ? "down" : "up");
      setDelta(value - prev.current);
      prev.current = value;
      const t = setTimeout(() => {
        setKick(null);
        setDelta(null);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [value]);
  const ticks = Array.from({ length: 50 }, (_, i) => i);
  const angle = (100 - value) * 3.6; // one full turn from 100 to 0
  const zone = value <= 25 ? "alarm" : value <= 55 ? "warm" : "cold";
  return (
    <div className={`rdial ${zone}${kick ? ` kick-${kick}` : ""}`} style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`${label} ${value} of 100`}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id="rd-face" cx="40%" cy="35%" r="75%">
            <stop offset="0" stopColor="#3a4d5e" />
            <stop offset="1" stopColor="#1a2630" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="#121b23" />
        <circle cx="60" cy="60" r="52" fill="url(#rd-face)" stroke="#516577" strokeWidth="1.5" />
        <g className="rdial-ring" style={{ transform: `rotate(${angle}deg)` }}>
          {ticks.map((i) => {
            const a = (i / ticks.length) * Math.PI * 2 - Math.PI / 2;
            const long = i % 5 === 0;
            const r1 = long ? 40 : 45;
            return (
              <line key={i} x1={60 + Math.cos(a) * r1} y1={60 + Math.sin(a) * r1} x2={60 + Math.cos(a) * 50} y2={60 + Math.sin(a) * 50}
                stroke={long ? "#ece6d6" : "#6f818f"} strokeWidth={long ? 2 : 1} />
            );
          })}
        </g>
        {/* fixed index */}
        <path d="M60 4 l-5 -1 h10 z" fill="var(--alarm)" />
        <path d="M60 10 l-4 -7 h8 z" fill="var(--alarm)" />
        {/* lamp */}
        <circle className="rdial-lamp" cx="60" cy="88" r="4" />
        <text x="60" y="66" textAnchor="middle" fontFamily="var(--display)" fontWeight="900" fontSize="30" fill="#ece6d6" className="num">{value}</text>
      </svg>
      <span className="rdial-label">{label}</span>
      {delta !== null && delta !== 0 && (
        <span className={`rdial-delta num ${delta < 0 ? "down" : "up"}`} aria-hidden="true">
          {delta < 0 ? "−" : "+"}
          {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}
