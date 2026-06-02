import { useEffect, useRef, useState } from "react";

/**
 * Animate the first number inside a display string while preserving any
 * surrounding text, e.g. "29,806", "5d", "~3.2/day". Non-numeric values
 * (like "—") render unchanged.
 */
export function CountUp({
  value,
  duration = 900,
}: {
  value: string;
  duration?: number;
}) {
  const match = value.match(/[\d,.]+/);
  const target = match ? parseFloat(match[0].replace(/,/g, "")) : null;
  const [n, setN] = useState(target ?? 0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target == null) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setN(target);
      return;
    }
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setN(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  if (target == null || !match) return <>{value}</>;
  const isInt = Number.isInteger(target);
  const shown = isInt ? Math.round(n).toLocaleString() : n.toFixed(1);
  return <>{value.replace(match[0], shown)}</>;
}
