"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const LAUNCH_AT = new Date("2026-07-16T12:39:00+05:30").getTime();

type TimeLeft = {
  hours: number;
  minutes: number;
  seconds: number;
  launched: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  gravity: number;
  size: number;
  color: string;
};

const initialTime: TimeLeft = { hours: 0, minutes: 0, seconds: 0, launched: false };
const colors = ["#ef3030", "#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7", "#ffffff"];

function getTimeLeft(): TimeLeft {
  const remaining = Math.max(0, LAUNCH_AT - Date.now());

  return {
    hours: Math.floor(remaining / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1_000),
    launched: remaining === 0,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

export function LaunchCelebration() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(initialTime);
  const [hydrated, setHydrated] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setHydrated(true);
    setTimeLeft(getTimeLeft());

    const timer = window.setInterval(() => {
      const next = getTimeLeft();
      setTimeLeft(next);
      if (next.launched) window.clearInterval(timer);
    }, 1_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!celebrating) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let animationFrame = 0;
    let lastBurst = 0;
    let running = true;
    const particles: Particle[] = [];
    const startedAt = performance.now();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * pixelRatio);
      canvas.height = Math.floor(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const addBurst = () => {
      const x = window.innerWidth * (0.15 + Math.random() * 0.7);
      const y = window.innerHeight * (0.12 + Math.random() * 0.42);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const count = window.innerWidth < 640 ? 34 : 54;

      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + Math.random() * 0.14;
        const speed = 2.2 + Math.random() * 4.8;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.009 + Math.random() * 0.012,
          gravity: 0.035 + Math.random() * 0.025,
          size: 1.5 + Math.random() * 2.4,
          color,
        });
      }
    };

    const addConfetti = () => {
      const count = window.innerWidth < 640 ? 48 : 90;
      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * window.innerHeight * 0.25,
          vx: -1.5 + Math.random() * 3,
          vy: 1.5 + Math.random() * 3,
          life: 1,
          decay: 0.0025 + Math.random() * 0.003,
          gravity: 0.025,
          size: 2 + Math.random() * 3,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    const draw = (now: number) => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (now - lastBurst > 430 && now - startedAt < 6_500) {
        addBurst();
        lastBurst = now;
      }

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.vy += particle.gravity;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.992;
        particle.life -= particle.decay;

        if (particle.life <= 0 || particle.y > window.innerHeight + 30) {
          particles.splice(index, 1);
          continue;
        }

        context.globalAlpha = Math.max(0, particle.life);
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
      if (running && (now - startedAt < 7_500 || particles.length > 0)) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    resize();
    addConfetti();
    addBurst();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, [celebrating]);

  const launch = useCallback(() => {
    if (!timeLeft.launched) return;
    setCelebrating(true);
  }, [timeLeft.launched]);

  const launched = hydrated && timeLeft.launched;

  return (
    <>
      <section
        className="border-b border-red-100 bg-gradient-to-r from-orange-50 via-white to-red-50 px-4 py-2.5"
        aria-label="PDFRoot Rathyatra launch"
      >
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-between lg:px-4">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="text-lg" aria-hidden="true">🚩</span>
            <p className="text-sm font-semibold text-zinc-800">
              PDFRoot Rathyatra Launch
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!launched ? (
              <div className="flex items-center gap-1.5" aria-live="polite" aria-label="Time remaining until launch">
                {[
                  [pad(timeLeft.hours), "HR"],
                  [pad(timeLeft.minutes), "MIN"],
                  [pad(timeLeft.seconds), "SEC"],
                ].map(([value, label], index) => (
                  <div key={label} className="flex items-center gap-1.5">
                    {index > 0 ? <span className="font-semibold text-red-300">:</span> : null}
                    <span className="min-w-9 rounded-md border border-red-100 bg-white px-1.5 py-1 text-center text-sm font-bold tabular-nums text-red-600 shadow-sm">
                      {hydrated ? value : "--"}
                      <span className="ml-0.5 text-[8px] font-semibold text-zinc-400">{label}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="hidden text-xs font-medium text-green-700 sm:inline">The wait is over!</span>
            )}

            <button
              type="button"
              onClick={launch}
              disabled={!launched}
              className="focus-ring inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(220,38,38,0.2)] transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {launched ? "🚀 Launch PDFRoot" : "Launch at 12:39 PM"}
            </button>
          </div>
        </div>
      </section>

      {celebrating ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden bg-slate-950/80 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-celebration-title"
        >
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-7 text-center shadow-2xl sm:p-9">
            <button
              type="button"
              onClick={() => setCelebrating(false)}
              className="focus-ring absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Close celebration"
            >
              ×
            </button>
            <div className="mb-3 text-5xl" aria-hidden="true">🎉</div>
            <h2 id="launch-celebration-title" className="text-3xl font-extrabold tracking-tight text-zinc-900">
              <span className="text-primary">PDF</span>Root is Live!
            </h2>
            <p className="mt-3 text-xl font-semibold text-orange-600">शुभ रथयात्रा 🚩</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Fast, free PDF and image tools—all in one place.
            </p>
            <Link
              href="/tools"
              onClick={() => setCelebrating(false)}
              className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.24)] transition hover:-translate-y-0.5 hover:bg-brand-700"
            >
              Explore All Tools
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
