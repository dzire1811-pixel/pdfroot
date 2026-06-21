"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CloudUpload, FileType, ImageIcon, SlidersHorizontal } from "lucide-react";
import { ToolSearch } from "@/components/ToolSearch";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.92_0_0/0.5)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0_0/0.5)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pb-24 lg:pt-32">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
            PDF &amp; Government Form Tools
          </div>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Convert PDFs &amp; Resize Images for Government Forms in Seconds
          </h1>

          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            Convert, compress, merge and split PDFs. Resize photos and signatures for SSC, RRB, UPSC, IBPS, GPSC and OJAS applications.
          </p>

          <ToolSearch />

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/resize-image-to-exact-kb" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition hover:bg-primary/90">
              <CloudUpload className="h-5 w-5" aria-hidden="true" />
              Select File
            </Link>
            <a href="#tools" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 text-base font-medium text-foreground transition hover:bg-muted">
              Explore All Tools
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-foreground sm:max-w-md">
            {["No Registration Required", "Secure Processing", "Mobile Friendly", "Free Online Tools"].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function run() {
      setDone(false);
      setProgress(0);
      const tick = (value: number) => {
        if (value >= 100) {
          setProgress(100);
          setDone(true);
          timer = setTimeout(run, 2600);
          return;
        }
        setProgress(value);
        timer = setTimeout(() => tick(value + 4), 60);
      };
      timer = setTimeout(() => tick(0), 600);
    }
    run();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative lg:self-start lg:pt-6">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-muted/60 [mask-image:linear-gradient(to_bottom,black,transparent)] lg:-inset-6" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-border" />
            <span className="h-3 w-3 rounded-full bg-border" />
            <span className="h-3 w-3 rounded-full bg-border" />
          </div>
          <div className="ml-2 flex-1 truncate rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground">
            pdfroot.com/resize-image-to-exact-kb
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CloudUpload className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Choose a tool and set your output</p>
            <p className="mt-1 text-xs text-muted-foreground">Illustrative preview for PDF and image workflows</p>
          </div>

          <div className="space-y-2.5">
            <WorkflowRow icon={<ImageIcon className="h-4 w-4" />} name="Image resize" detail="Target KB and dimensions" progress={progress} done={done} />
            <WorkflowRow icon={<FileType className="h-4 w-4" />} name="PDF conversion" detail="Convert, merge or compress" progress={Math.min(100, progress + 18)} done={done} />
          </div>

          <Link href="/tools" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Browse tools
          </Link>
        </div>
      </div>
    </div>
  );
}

function WorkflowRow({
  icon,
  name,
  detail,
  progress,
  done,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  progress: number;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <span className="shrink-0 text-xs font-semibold text-foreground">{done ? "Preview ready" : "Preparing"}</span>
        </div>
        {done ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {detail}
          </span>
        ) : (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-150" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
