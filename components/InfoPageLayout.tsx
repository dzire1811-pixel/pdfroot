import type { ReactNode } from "react";
import { BrandPhrase } from "@/components/Brand";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { imageTools, pdfTools, tools } from "@/lib/tools";

export function InfoPageLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v0-homepage min-h-screen bg-background text-foreground">
      <HomepageSiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-background px-6 py-14 sm:py-16 lg:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.92_0_0/0.5)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0_0/0.5)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          />
          <div className="relative mx-auto max-w-[1800px] text-center">
            <p className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              {typeof eyebrow === "string" ? <BrandPhrase text={eyebrow} styled /> : eyebrow}
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {typeof title === "string" ? <BrandPhrase text={title} styled /> : title}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
                {typeof subtitle === "string" ? <BrandPhrase text={subtitle} styled /> : subtitle}
              </p>
            ) : null}
          </div>
        </section>

        <section className="px-6 py-16 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-[1800px]">
            <div className="mx-auto max-w-4xl space-y-8">{children}</div>
          </div>
        </section>
      </main>
      <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((tool) => tool.government)} />
    </div>
  );
}

export function InfoCard({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 text-left sm:p-7">
      {title ? <h2 className="text-2xl font-bold tracking-tight text-foreground">{typeof title === "string" ? <BrandPhrase text={title} styled /> : title}</h2> : null}
      <div className={title ? "mt-4 space-y-4 text-base leading-relaxed text-muted-foreground" : "space-y-4 text-base leading-relaxed text-muted-foreground"}>{children}</div>
    </section>
  );
}

export function InfoBulletGrid({ items }: { items: string[] }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
          <BrandPhrase text={item} styled />
        </div>
      ))}
    </div>
  );
}

export function InfoCta({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-primary p-8 text-center text-primary-foreground sm:p-10">{children}</div>;
}
