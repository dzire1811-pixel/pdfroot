"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { ToolRating } from "@/lib/tool-review-types";

type RatingProps = { toolName: string; toolSlug: string };
const stars = [1, 2, 3, 4, 5];

export function ToolFeedback(props: RatingProps) {
  return <RatingRow key={props.toolSlug} {...props} />;
}

function RatingRow({ toolName, toolSlug }: RatingProps) {
  const row = useRef<HTMLElement>(null);
  const read = useRef<AbortController | null>(null);
  const requestId = useRef("");
  const busy = useRef(false);
  const [summary, setSummary] = useState<ToolRating | null>(null);
  const [preview, setPreview] = useState(0);
  const [state, setState] = useState<"ready" | "saving" | "voted">("ready");
  const [error, setError] = useState("");
  const storageKey = `pdfroot:tool-vote:${toolSlug}`;

  useEffect(() => {
    try {
      const previous = localStorage.getItem(storageKey);
      if (previous === "voted") setState("voted");
      else if (previous) requestId.current = previous;
    } catch { /* Voting also works when browser storage is unavailable. */ }

    const controller = new AbortController();
    read.current = controller;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      fetch(`/api/tool-reviews?tool=${encodeURIComponent(toolSlug)}`, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          if (!response.ok) throw new Error();
          const data: ToolRating = await response.json();
          if (!controller.signal.aborted) setSummary(data);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError("Ratings unavailable.");
        });
    }, { rootMargin: "240px" });
    if (row.current) observer.observe(row.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, [toolSlug, storageKey]);

  async function vote(rating: number) {
    if (busy.current || state !== "ready") return;
    busy.current = true;
    setState("saving");
    setPreview(rating);
    setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      try { localStorage.setItem(storageKey, requestId.current); } catch { /* Optional storage. */ }
      const response = await fetch("/api/tool-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolSlug, rating, requestId: requestId.current }),
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? "Too many votes. Try later." : "Vote failed. Tap a star to retry.");
      }
      const data: ToolRating = await response.json();
      read.current?.abort();
      setSummary(data);
      setError("");
      setState("voted");
      try { localStorage.setItem(storageKey, "voted"); } catch { /* Optional storage. */ }
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Vote failed. Tap a star to retry.");
      setState("ready");
    } finally {
      busy.current = false;
      setPreview(0);
    }
  }

  const displayed = preview || summary?.average || 0;

  return (
    <section ref={row} data-merge-result-only="feedback" aria-label={`Rate ${toolName}`} className="px-1 py-3 sm:px-2">
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] leading-5 max-[359px]:gap-x-1 max-[359px]:text-xs sm:gap-x-3 sm:text-sm text-foreground">
        <span className="font-bold">Rate this tool</span>
        <div role="group" aria-label="Choose a star rating" className="inline-flex items-center"
          onMouseLeave={() => { if (!busy.current) setPreview(0); }}>
          {stars.map(value => {
            const fill = Math.max(0, Math.min(1, displayed - value + 1)) * 100;
            const label = `Rate ${value} ${value === 1 ? "star" : "stars"}`;
            return (
              <button key={value} type="button" aria-label={label} title={state === "voted" ? "Vote recorded" : label}
                disabled={state !== "ready"} onClick={() => void vote(value)}
                onMouseEnter={() => { if (state === "ready") setPreview(value); }}
                onFocus={() => { if (state === "ready") setPreview(value); }}
                onBlur={() => { if (!busy.current) setPreview(0); }}
                className="inline-flex h-8 w-6 max-[359px]:w-5 items-center justify-center border-0 bg-transparent p-0 text-[#ffbf00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
                <span aria-hidden="true" className="relative block h-[22px] w-[22px]">
                  <Star className="block h-[22px] w-[22px]" strokeWidth={1.5} />
                  <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill}%` }}>
                    <Star className="block h-[22px] w-[22px] max-w-none fill-current" strokeWidth={1.5} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <span aria-live="polite" className="whitespace-nowrap font-serif">
          {summary ? <>
            <strong className="font-sans">{summary.ratings ? summary.average.toFixed(1) : "—"}</strong>
            {" / 5 - "}{summary.ratings.toLocaleString("en-US")} {summary.ratings === 1 ? "vote" : "votes"}
          </> : "—"}
          {state === "voted" && <span className="sr-only">. Vote recorded.</span>}
        </span>
        {error && <span role="status" className="text-xs text-muted-foreground">{error}</span>}
      </div>
    </section>
  );
}
