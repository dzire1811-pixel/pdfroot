import { Check, Search } from "lucide-react";
import { AllToolsExplorer } from "@/components/AllToolsExplorer";
import { BrandPhrase, BrandText, SectionHeading } from "@/components/Brand";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { ToolCard } from "@/components/ToolCard";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { imageTools, pdfTools, tools } from "@/lib/tools";

const popularTools = tools.filter((tool) => tool.popular);
const governmentTools = tools.filter((tool) => tool.government);

function PreviewGrid({ items }: { items: typeof tools }) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {items.slice(0, 12).map((tool) => (
        <ToolCard key={tool.slug} tool={tool} compact />
      ))}
    </div>
  );
}

export function ToolsDirectoryPage() {
  return (
    <div className="v0-homepage min-h-screen bg-background text-foreground">
      <HomepageSiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-background px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.92_0_0/0.5)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0_0/0.5)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          />
          <div className="mx-auto max-w-4xl text-center">
            <div className="relative inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Search className="h-4 w-4" aria-hidden="true" />
              <BrandText styled /> Tools Directory
            </div>
            <h1 className="relative mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              All PDF & Image Tools
            </h1>
            <p className="relative mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              <BrandPhrase text="Search, filter, and open PDFRoot tools for PDF conversion, compression, image resizing, exact KB files, and government form uploads." styled />
            </p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              {["PDF Tools", "Image Tools", "Government Form Tools", "No Registration"].map((badge) => (
                <span key={badge} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        <AllToolsExplorer />

        <section className="border-y border-border bg-muted/40 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Popular Tools" title="Most used PDFRoot tools" description="Quick access to everyday PDF, image, and form-ready document tools." />
            <PreviewGrid items={popularTools} />
          </div>
        </section>

        <section className="bg-background px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="PDF Tools" title="Convert, compress, merge, and organize PDFs" description="Use PDFRoot tools for common PDF workflows across office, school, and upload portals." />
            <PreviewGrid items={pdfTools} />
          </div>
        </section>

        <section className="border-y border-border bg-muted/40 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Image Tools" title="Resize, compress, convert, and prepare images" description="Image utilities for photos, signatures, scans, cards, and online forms." />
            <PreviewGrid items={imageTools} />
          </div>
        </section>

        <section className="bg-background px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Government Form Tools" title="Tools for recruitment and official forms" description="Prepare exact KB photos, signatures, passport photos, and document card layouts." />
            <PreviewGrid items={governmentTools} />
          </div>
        </section>
        <WhyChoosePdfRoot />
      </main>
      <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={governmentTools} />
    </div>
  );
}
