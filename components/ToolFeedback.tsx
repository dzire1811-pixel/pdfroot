"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Star } from "lucide-react";

import type { ToolReviews } from "@/lib/tool-review-types";

const ratingValues = [1, 2, 3, 4, 5] as const;

type FeedbackProps = { toolName: string; toolSlug: string };

export function ToolFeedback(props: FeedbackProps) {
  return <FeedbackPanel key={props.toolSlug} {...props} />;
}

function FeedbackPanel({ toolName, toolSlug }: FeedbackProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "submitted">("idle");
  const submissionStartedRef = useRef(false);
  const visibleRating = hoveredRating || rating;

  const panelRef = useRef<HTMLElement>(null);
  const activeRead = useRef<AbortController | null>(null);
  const lastAttempt = useRef<{ payload: string; id: string } | null>(null);
  const [page, setPage] = useState<ToolReviews | null>(null);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const loadReviews = useCallback(async (before: string | null = null) => {
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    setLoading(true);
    setReadError("");
    try {
      const params = new URLSearchParams({ tool: toolSlug });
      if (before) params.set("before", before);
      const response = await fetch(`/api/tool-reviews?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const fresh: ToolReviews = await response.json();
      if (!controller.signal.aborted) {
        setPage(previous => before && previous ? { ...fresh, reviews: [...previous.reviews, ...fresh.reviews] } : fresh);
      }
    } catch {
      if (!controller.signal.aborted) setReadError("Could not load reviews.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [toolSlug]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void loadReviews();
      }
    }, { rootMargin: "240px" });
    observer.observe(panel);
    return () => { observer.disconnect(); activeRead.current?.abort(); };
  }, [loadReviews]);

  useEffect(() => {
    if (submissionState !== "submitted") return;

    const resetTimer = window.setTimeout(() => {
      setRating(0);
      setHoveredRating(0);
      setSubmissionState("idle");
      submissionStartedRef.current = false;
    }, 3000);

    return () => window.clearTimeout(resetTimer);
  }, [submissionState]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionStartedRef.current || rating === 0) return;

    submissionStartedRef.current = true;
    setSubmissionState("submitting");
    const formData = new FormData(event.currentTarget);
    const feedback = String(formData.get("feedback") ?? "").trim();
    const payload = JSON.stringify({ tool: toolSlug, rating, comment: feedback });
    setSubmitError("");
    try {
      if (lastAttempt.current?.payload !== payload) {
        lastAttempt.current = { payload, id: crypto.randomUUID() };
      }
      const response = await fetch("/api/tool-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolSlug, rating, comment: feedback, requestId: lastAttempt.current.id }),
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? "Too many ratings. Please try again later." : "Could not submit your rating. Please try again.");
      }
      const fresh: ToolReviews = await response.json();
      activeRead.current?.abort();
      setPage(fresh);
      setReadError("");
      setLoading(false);
      lastAttempt.current = null;
      setSubmissionState("submitted");
    } catch (error) {
      setSubmitError(error instanceof TypeError ? "Check your connection and try again." : error instanceof Error ? error.message : "Please try again.");
      submissionStartedRef.current = false;
      setSubmissionState("idle");
    }
  }

  return (
    <section
      ref={panelRef}
      data-merge-result-only="feedback"
      aria-label={submissionState === "submitted" ? "Tool feedback" : undefined}
      aria-labelledby={submissionState === "submitted" ? undefined : `tool-feedback-${toolSlug}`}
      className="bg-muted/40 px-4 pb-2 pt-2 sm:px-6 lg:px-8"
    >
      {submissionState === "submitted" ? (
        <div role="status" aria-live="polite" className="mx-auto max-w-[1040px] rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm shadow-foreground/[0.03] sm:px-5">
          <p className="text-base font-semibold text-foreground">✅ Thank you for your feedback!</p>
          <p className="mt-1 text-sm text-muted-foreground">Your rating is included below.</p>
        </div>
      ) : (
        <form onSubmit={submitFeedback} aria-busy={submissionState === "submitting"} className="mx-auto max-w-[1040px] rounded-2xl border border-border bg-card px-4 py-4 shadow-sm shadow-foreground/[0.03] sm:px-5">
          <div>
            <h2 id={`tool-feedback-${toolSlug}`} className="text-lg font-semibold leading-snug tracking-tight text-foreground">
              Was this tool helpful?
            </h2>

            <fieldset aria-describedby={`tool-feedback-help-${toolSlug}`} className="mt-2.5">
              <legend className="sr-only">Rate this tool from 1 to 5 stars</legend>
              <div className="flex items-center gap-1" onMouseLeave={() => setHoveredRating(0)}>
                {ratingValues.map((value) => (
                  <label
                    key={value}
                    className="cursor-pointer rounded-md p-1 text-slate-300 outline-none transition-colors hover:text-amber-400 focus-within:ring-2 focus-within:ring-primary/40"
                    onMouseEnter={() => setHoveredRating(value)}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      required
                    />
                    <Star className={`pointer-events-none h-8 w-8 transition-[color,fill,transform] duration-150 ${value <= visibleRating ? "scale-105 fill-amber-400 text-amber-400" : "fill-transparent"}`} aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>

            <p id={`tool-feedback-help-${toolSlug}`} className="mt-2 text-sm text-muted-foreground">Your rating and optional review will be public. Please leave out personal details.</p>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              name="feedback"
              rows={2}
              maxLength={300}
              aria-label="Optional public review"
              className="h-12 min-h-12 w-full min-w-0 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal leading-5 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Write a public review (optional)"
            />
            <button
              type="submit"
              disabled={rating === 0 || submissionState === "submitting"}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {submissionState === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit Feedback"
              )}
            </button>
          </div>
          {submitError && <p role="alert" className="mt-2 text-sm text-primary">{submitError}</p>}
        </form>
      )}
      <div className="mx-auto mt-3 max-w-[1040px] rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm sm:px-5">
        <h3 className="text-lg font-semibold text-foreground">Ratings &amp; Reviews · {toolName}</h3>
        {page && (page.ratings ? (
          <p className="mt-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="text-amber-500">★ </span>
            <strong className="text-foreground">{page.average.toFixed(1)} / 5</strong>
            {" · "}{page.ratings} {page.ratings === 1 ? "rating" : "ratings"}
            {" · "}{page.written} {page.written === 1 ? "review" : "reviews"}
          </p>
        ) : <p className="mt-2 text-sm text-muted-foreground">Be the first to rate this tool.</p>)}
        {Boolean(page?.reviews.length) && (
          <ul className="mt-3 divide-y divide-border">
            {page?.reviews.map(review => (
              <li key={review.id} className="py-3">
                <span aria-label={`${review.rating} out of 5 stars`} role="img" className="text-amber-500">
                  {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                </span>
                <time dateTime={review.date} className="ml-2 text-xs text-muted-foreground">
                  {new Date(review.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </time>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{review.comment}</p>
              </li>
            ))}
          </ul>
        )}
        {loading && <p role="status" className="mt-2 text-sm text-muted-foreground">Loading reviews…</p>}
        {readError && <p role="status" className="mt-2 text-sm text-muted-foreground">{readError}</p>}
        {(page?.next || readError) && (
          <button type="button" disabled={loading || submissionState === "submitting"} onClick={() => void loadReviews(page?.next ?? null)}
            className="mt-2 rounded-md py-1 text-sm font-semibold text-primary underline disabled:opacity-60">
            {readError ? "Retry" : page?.reviews.length === 3 ? "View all reviews" : "Show more reviews"}
          </button>
        )}
      </div>
    </section>
  );
}
