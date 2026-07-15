"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Star } from "lucide-react";

const ratingValues = [1, 2, 3, 4, 5] as const;

export function ToolFeedback({ toolName, toolSlug }: { toolName: string; toolSlug: string }) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "submitted">("idle");
  const submissionStartedRef = useRef(false);
  const visibleRating = hoveredRating || rating;

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
    const subject = `PDFRoot feedback: ${toolName}`;
    const body = [`Tool: ${toolName}`, `Rating: ${rating} out of 5`, feedback ? `Feedback: ${feedback}` : "Feedback: No written comment provided."].join("\n");
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      window.location.href = `mailto:support@pdfroot.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setSubmissionState("submitted");
    } catch {
      submissionStartedRef.current = false;
      setSubmissionState("idle");
    }
  }

  return (
    <section
      data-merge-result-only="feedback"
      aria-label={submissionState === "submitted" ? "Tool feedback" : undefined}
      aria-labelledby={submissionState === "submitted" ? undefined : `tool-feedback-${toolSlug}`}
      className="bg-muted/40 px-4 pb-2 pt-2 sm:px-6 lg:px-8"
    >
      {submissionState === "submitted" ? (
        <div role="status" aria-live="polite" className="mx-auto max-w-[1040px] rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm shadow-foreground/[0.03] sm:px-5">
          <p className="text-base font-semibold text-foreground">✅ Thank you for your feedback!</p>
          <p className="mt-1 text-sm text-muted-foreground">Your feedback helps us improve PDFRoot.</p>
          <div className="mx-auto mt-3 max-w-md border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            <p>🔒 Your feedback is used only to improve PDFRoot.</p>
            <p>We never publish your comments without permission.</p>
          </div>
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

            <p id={`tool-feedback-help-${toolSlug}`} className="mt-2 text-sm text-muted-foreground">Your feedback helps us improve PDFRoot.</p>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              name="feedback"
              rows={2}
              maxLength={300}
              aria-label="Optional feedback"
              className="h-12 min-h-12 w-full min-w-0 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal leading-5 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Share a short comment"
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
        </form>
      )}
    </section>
  );
}
