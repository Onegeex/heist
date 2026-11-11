"use client";

import { useEffect, useState } from "react";

/** The vault door. The combination ring spins once on load and stops on the live bounty. */
export function VaultDial({ bounty, caption = "NEAR in the vault", open = false }: { bounty: string; caption?: string; open?: boolean }) {
  const [spin, setSpin] = useState(false);
  useEffect(() => setSpin(true), []);
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const bolts = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="dial-wrap">
      <svg viewBox="0 0 500 500" role="img" aria-label={`${bounty} ${caption}`} style={{ width: "100%", height: "100%" }}>
        <defs>
          <radialGradient id="door" cx="40%" cy="35%" r="75%">
            <stop offset="0" stopColor="#4a5d6e" />
            <stop offset=".6" stopColor="#2c3c4b" />
            <stop offset="1" stopColor="#1d2934" />
          </radialGradient>
          <radialGradient id="hub" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#e3c46f" />
            <stop offset=".55" stopColor="#c8a24a" />
            <stop offset="1" stopColor="#7c6229" />
          </radialGradient>
          <linearGradient id="spoke" x1="0" x2="1">
            <stop offset="0" stopColor="#8a9aa8" />
            <stop offset=".5" stopColor="#d5dde3" />
            <stop offset="1" stopColor="#6a7a88" />
          </linearGradient>
        </defs>

        {/* frame + door */}
        <circle cx="250" cy="250" r="246" fill="#141d26" />
        <circle cx="250" cy="250" r="236" fill="url(#door)" stroke="#516577" strokeWidth="2" />
        {bolts.map((i) => {
          const a = (i / bolts.length) * Math.PI * 2;
          return <circle key={i} cx={250 + Math.cos(a) * 218} cy={250 + Math.sin(a) * 218} r="7" fill="#1a242e" stroke="#6b7f90" strokeWidth="1.5" />;
        })}

        {/* combination ring */}
        <g className={`dial-ring${spin ? " spin" : ""}`}>
          <circle cx="250" cy="250" r="190" fill="#1f2b36" stroke="#5b6f80" strokeWidth="2" />
          {ticks.map((i) => {
            const a = (i / ticks.length) * Math.PI * 2 - Math.PI / 2;
            const long = i % 5 === 0;
            const r1 = long ? 166 : 175;
            return (
              <line key={i} x1={250 + Math.cos(a) * r1} y1={250 + Math.sin(a) * r1} x2={250 + Math.cos(a) * 186} y2={250 + Math.sin(a) * 186}
                stroke={long ? "#ece6d6" : "#7f909e"} strokeWidth={long ? 3 : 1.5} />
            );
          })}
          {ticks.filter((i) => i % 10 === 0).map((i) => {
            const a = (i / ticks.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <text key={i} x={250 + Math.cos(a) * 146} y={250 + Math.sin(a) * 146 + 7} textAnchor="middle"
                fontFamily="var(--display)" fontSize="22" fontWeight="800" fill="#ece6d6">{i}</text>
            );
          })}
        </g>
        {/* index mark */}
        <path d="M250 50 l-10 -16 h20 z" fill="#e0303f" />

        {/* wheel handle */}
        <g style={{ transformOrigin: "250px 250px", transform: open ? "rotate(120deg)" : "none", transition: "transform 1.2s ease" }}>
          {[0, 120, 240].map((r) => (
            <g key={r} transform={`rotate(${r} 250 250)`}>
              <rect x="244" y="132" width="12" height="70" rx="5" fill="url(#spoke)" />
              <circle cx="250" cy="128" r="11" fill="url(#spoke)" />
            </g>
          ))}
        </g>

        {/* hub: the bounty */}
        <circle cx="250" cy="250" r="96" fill="url(#hub)" stroke="#f0d68f" strokeWidth="2" />
        <circle cx="250" cy="250" r="84" fill="none" stroke="rgba(60,44,10,.35)" strokeWidth="1.5" />
        <text x="250" y="262" textAnchor="middle" fontFamily="var(--display)" fontWeight="900" fontSize={bounty.length > 6 ? 46 : 58} fill="#1b1608" className="num">
          {bounty}
        </text>
        <text x="250" y="292" textAnchor="middle" fontFamily="var(--body)" fontWeight="600" fontSize="15" fill="#3a2e10">{caption}</text>
      </svg>
    </div>
  );
}
