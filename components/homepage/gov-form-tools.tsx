import Link from "next/link";
import { ArrowRight, Check, Crop, X } from "lucide-react";
import type { Tool } from "@/lib/tools";

const exams = ["SSC", "RRB", "UPSC", "GPSC", "IBPS", "OJAS", "Railway"];

export function GovFormTools({ tools }: { tools: Tool[] }) {
  return (
    <section id="gov-tools" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Built for India&apos;s exams</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Never get your application rejected because of incorrect photo or signature size
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Built for SSC, RRB, UPSC, GPSC, IBPS, OJAS and Railway recruitment forms.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {exams.map((exam) => (
              <span key={exam} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                {exam}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
          <BeforeAfter />

          <div className="grid gap-4 sm:grid-cols-2">
            {tools.slice(0, 5).map((tool, index) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  className={
                    "group flex h-full min-h-[112px] flex-col rounded-lg border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-foreground/5 " +
                    (index === 4 ? "sm:col-span-2" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-300 group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mt-2.5 line-clamp-2 min-h-[2.25rem] text-[13px] font-semibold leading-[1.125rem] text-foreground">{tool.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open tool
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Crop className="h-4 w-4 text-primary" aria-hidden="true" />
        Illustrative size check
      </div>
      <div className="mt-5 grid flex-1 grid-cols-2 gap-4">
        <figure className="flex flex-col rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Before</span>
            <span className="text-sm font-bold text-foreground">4.2 MB</span>
          </div>
          <div className="mt-3 flex flex-1 items-center justify-center rounded-lg bg-background p-3">
            <PhotoMock />
          </div>
          <figcaption className="mt-3 space-y-1.5">
            <StatusLine ok={false} label="Above target" />
            <StatusLine ok={false} label="Needs resize" />
          </figcaption>
        </figure>

        <figure className="flex flex-col rounded-xl border border-success/30 bg-success/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-success">After</span>
            <span className="text-sm font-bold text-foreground">20 KB</span>
          </div>
          <div className="mt-3 flex flex-1 items-center justify-center rounded-lg bg-background p-3">
            <PhotoMock />
          </div>
          <figcaption className="mt-3 space-y-1.5">
            <StatusLine ok label="Exact size" />
            <StatusLine ok label="Within target" />
          </figcaption>
        </figure>
      </div>
      <div className="mt-5 rounded-xl bg-muted/50 p-4">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Target size</span>
          <span className="text-foreground">20 KB</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-[16%] rounded-full bg-primary" />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>10 KB</span>
          <span>50 KB</span>
          <span>100 KB</span>
        </div>
      </div>
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span className={"flex h-4 w-4 items-center justify-center rounded-full " + (ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
        {ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
      </span>
      <span className={ok ? "text-success" : "text-destructive"}>{label}</span>
    </div>
  );
}

function PhotoMock() {
  return (
    <svg viewBox="0 0 96 116" className="h-28 w-auto" aria-hidden="true">
      <rect width="96" height="116" rx="6" fill="oklch(0.96 0.01 250)" />
      <rect x="6" y="6" width="84" height="104" rx="4" fill="oklch(0.9 0.03 240)" />
      <circle cx="48" cy="44" r="20" fill="oklch(0.78 0.06 60)" />
      <path d="M20 104c0-18 12.5-28 28-28s28 10 28 28" fill="oklch(0.45 0.08 255)" />
    </svg>
  );
}
