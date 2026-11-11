"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to its value on first view, and flashes brass when it
 * grows later (a new attempt fed the vault). Static for reduced-motion users.
 */
export function CountUp({ value, digits = 1, className = "" }: { value: number; digits?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = prev.current ?? 0;
    const grew = prev.current !== null && value > prev.current;
    prev.current = value;
    if (reduce || from === value) {
      setShown(value);
      return;
    }
    if (grew) {
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    }
    let raf = 0;
    const start = performance.now();
    const dur = grew ? 700 : 1300;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span ref={ref} className={`num ${className}${flash ? " flash" : ""}`}>
      {shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
    </span>
  );
}
