"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { BrandPhrase } from "@/components/Brand";

export type HomepageFaqItem = {
  question: string;
  answer: string;
};

export function Faq({ items }: { items: HomepageFaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-[1800px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">FAQ</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Frequently asked questions</h2>
        </div>

        <div className="mx-auto mt-10 grid max-w-[1120px] gap-3">
          {items.map((item, index) => {
            const isOpen = open === index;
            const questionId = `homepage-faq-question-${index}`;
            const answerId = `homepage-faq-answer-${index}`;
            return (
              <div key={item.question} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  id={questionId}
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex min-h-[60px] w-full items-center justify-between gap-4 px-[18px] py-3 text-left transition-colors duration-200 hover:bg-primary/[0.06] focus-visible:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 active:bg-primary/[0.10]"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                >
                  <span className="min-w-0 flex-1 text-base font-medium text-foreground">
                    <BrandPhrase text={item.question} styled />
                  </span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                    {isOpen ? <Minus className="h-5 w-5" aria-hidden="true" /> : <Plus className="h-5 w-5" aria-hidden="true" />}
                  </span>
                </button>
                <div
                  id={answerId}
                  role="region"
                  aria-labelledby={questionId}
                  aria-hidden={!isOpen}
                  className={"grid transition-[grid-template-rows,opacity] duration-300 ease-out " + (isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-4xl px-[18px] pb-[18px] text-sm leading-relaxed text-muted-foreground">
                      <BrandPhrase text={item.answer} styled />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
