import type { ReactNode } from "react";
import { BrandPhrase } from "@/components/Brand";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { imageTools, pdfTools, tools } from "@/lib/tools";

export function BlogArticleLayout({
  breadcrumb,
  title,
  subtitle,
  children,
}: {
  breadcrumb: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v0-homepage min-h-screen bg-background text-foreground">
      <HomepageSiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-background px-6 pb-0 pt-14 sm:pt-16 lg:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.92_0_0/0.5)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0_0/0.5)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          />
          <div className="relative mx-auto max-w-[1800px] text-center">
            {breadcrumb}
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

        <section className="px-6 pb-16 pt-8 sm:pb-20 sm:pt-14 lg:px-8">
          <div className="mx-auto max-w-[1800px]">
            <div className="mx-auto max-w-4xl space-y-8">{children}</div>
          </div>
        </section>
      </main>
      <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((tool) => tool.government)} />
    </div>
  );
}
