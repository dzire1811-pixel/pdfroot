"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Ruler, Sliders, UserSquare2 } from "lucide-react";

const tabs = [
  { id: "resize", label: "Resize Image to Exact KB", icon: Ruler, slug: "resize-image-to-exact-kb" },
  { id: "passport", label: "Passport Photo Maker", icon: UserSquare2, slug: "passport-photo-maker" },
  { id: "jpg", label: "JPG to PDF", icon: Sliders, slug: "jpg-to-pdf" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ProductShowcase() {
  const [active, setActive] = useState<TabId>("resize");
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <section id="showcase" className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Product Preview</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Clean previews of the tools before you open them
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Illustrative screens that show the workflow without pretending to process uploaded files.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors " +
                  (isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-4xl">
          <AppWindow title={`pdfroot.com/${activeTab.slug}`}>
            {active === "resize" && <ResizeScreen />}
            {active === "passport" && <PassportScreen />}
            {active === "jpg" && <JpgScreen />}
            <div className="mt-5 flex justify-end">
              <Link href={`/${activeTab.slug}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                Open {activeTab.label}
              </Link>
            </div>
          </AppWindow>
        </div>
      </div>
    </section>
  );
}

function AppWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-border" />
          <span className="h-3 w-3 rounded-full bg-border" />
          <span className="h-3 w-3 rounded-full bg-border" />
        </div>
        <div className="ml-2 flex-1 truncate rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground">{title}</div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function PhotoMock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 116" className={className} aria-hidden="true">
      <rect width="96" height="116" rx="6" fill="oklch(0.96 0.01 250)" />
      <rect x="6" y="6" width="84" height="104" rx="4" fill="oklch(0.9 0.03 240)" />
      <circle cx="48" cy="44" r="20" fill="oklch(0.78 0.06 60)" />
      <path d="M20 104c0-18 12.5-28 28-28s28 10 28 28" fill="oklch(0.45 0.08 255)" />
    </svg>
  );
}

function ResizeScreen() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex items-center justify-center rounded-xl border border-border bg-muted/40 p-6">
        <PhotoMock className="h-44 w-auto rounded-lg" />
      </div>
      <div className="flex flex-col">
        <h3 className="text-lg font-semibold text-foreground">Resize settings</h3>
        <div className="mt-4 space-y-4">
          <Field label="Target size" value="20 KB" />
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Quality</span>
              <span className="font-medium text-foreground">High</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div className="h-full w-3/4 rounded-full bg-primary" />
            </div>
          </div>
          <Field label="Dimensions" value="200 x 230 px" />
          <Field label="Format" value="JPG" />
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          Example target settings applied
        </div>
      </div>
    </div>
  );
}

function PassportScreen() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="relative flex items-center justify-center rounded-xl border border-border bg-muted/40 p-6">
        <div className="relative">
          <PhotoMock className="h-44 w-auto rounded-lg" />
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-dashed border-primary/60" />
        </div>
      </div>
      <div className="flex flex-col">
        <h3 className="text-lg font-semibold text-foreground">Passport photo</h3>
        <div className="mt-4 space-y-4">
          <Field label="Size" value="3.5 x 4.5 cm" />
          <Field label="Background" value="Plain white" />
          <Field label="Face coverage" value="70-80%" />
          <Field label="Output" value="Photo + 6-up sheet" />
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          Example layout and crop guide
        </div>
      </div>
    </div>
  );
}

function JpgScreen() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((page) => (
          <div key={page} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <PhotoMock className="h-20 w-auto rounded" />
            <span className="text-[11px] text-muted-foreground">page {page}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-foreground">4 images to 1 PDF</p>
          <p className="text-xs text-muted-foreground">A4 · Portrait · illustrative preview</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
          <Check className="h-4 w-4" aria-hidden="true" />
          Preview arranged
        </span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
