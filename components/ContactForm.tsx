"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type SubmitState = "idle" | "sending" | "success" | "error";

export function ContactForm() {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState("");

  async function submitContactForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "sending") return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setSubmitState("sending");
    setFeedback("Sending your message...");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          subject: formData.get("subject"),
          message: formData.get("message"),
          company: formData.get("company"),
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(result?.message || "Your message could not be sent. Please try again.");
      }

      form.reset();
      setSubmitState("success");
      setFeedback(result?.message || "Your message has been sent to PDFRoot Support.");
    } catch (error) {
      setSubmitState("error");
      setFeedback(error instanceof Error ? error.message : "Your message could not be sent. Please try again.");
    }
  }

  return (
    <form onSubmit={submitContactForm} className="mt-6 grid gap-4" aria-busy={submitState === "sending"}>
      <label htmlFor="contact-name" className="text-sm font-semibold text-foreground">
        Name
        <input id="contact-name" className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="name" autoComplete="name" placeholder="Your name" required maxLength={100} />
      </label>
      <label htmlFor="contact-email" className="text-sm font-semibold text-foreground">
        Email
        <input id="contact-email" className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="email" autoComplete="email" placeholder="you@example.com" type="email" required maxLength={254} />
      </label>
      <label htmlFor="contact-subject" className="text-sm font-semibold text-foreground">
        Subject
        <input id="contact-subject" className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="subject" autoComplete="off" placeholder="What is this about?" required maxLength={160} />
      </label>
      <label htmlFor="contact-message" className="text-sm font-semibold text-foreground">
        Message
        <textarea id="contact-message" className="mt-2 min-h-36 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="message" autoComplete="off" placeholder="Write your message here" required minLength={10} maxLength={5000} />
      </label>
      <label className="hidden" aria-hidden="true">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
      <button type="submit" disabled={submitState === "sending"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-7 py-4 text-base font-medium text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">
        {submitState === "sending" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
        {submitState === "sending" ? "Sending..." : "Send to PDFRoot Support"}
      </button>
      {feedback ? (
        <p role="status" aria-live="polite" className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${submitState === "success" ? "bg-green-50 text-green-800" : submitState === "error" ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"}`}>
          {submitState === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
