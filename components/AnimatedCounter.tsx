"use client";

import { useEffect, useMemo, useState } from "react";

type AnimatedCounterProps = {
  value: string;
  label: string;
};

export function AnimatedCounter({ value, label }: AnimatedCounterProps) {
  const target = useMemo(() => Number.parseInt(value.replace(/\D/g, ""), 10), [value]);
  const suffix = value.replace(/[0-9]/g, "");
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target)) {
      return;
    }

    const duration = 1200;
    const start = performance.now();
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <>
      <p className="mt-4 text-4xl font-black tracking-tight text-slate-950" aria-label={`${value} ${label}`}>
        {current.toLocaleString()}
        {suffix}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-500">{label}</p>
    </>
  );
}
