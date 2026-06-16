import Link from "next/link";
import { ArrowRight, CheckCircle2, Search } from "lucide-react";
import { AllToolsExplorer } from "@/components/AllToolsExplorer";
import { LogoMark, SectionHeading } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialLinks } from "@/components/SocialLinks";
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

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 px-5 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex rounded-3xl bg-white p-3">
            <LogoMark />
          </div>
          <p className="mt-4 max-w-md leading-7 text-slate-300">PDFRoot - Smart PDF & Image Toolkit.</p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:text-[#FF2D2D]">
          Back to Homepage
          <ArrowRight className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
        </Link>
        <div className="flex flex-col gap-4 sm:items-end">
          <div className="flex flex-wrap justify-center gap-4 text-sm font-black text-slate-300 sm:justify-end">
            <Link href="/about" className="transition hover:text-white">
              About PDFRoot
            </Link>
            <Link href="/contact" className="transition hover:text-white">
              Contact
            </Link>
          </div>
          <SocialLinks className="sm:justify-end" linkClassName="text-slate-400 hover:text-white" />
        </div>
      </div>
    </footer>
  );
}

export function ToolsDirectoryPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              <Search className="h-4 w-4" aria-hidden="true" />
              PDFRoot Tools Directory
            </div>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              All PDF & Image Tools
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Search, filter, and open PDFRoot tools for PDF conversion, compression, image resizing, exact KB files, and government form uploads.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {["PDF Tools", "Image Tools", "Government Form Tools", "No Registration"].map((badge) => (
                <span key={badge} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <CheckCircle2 className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        <AllToolsExplorer />

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Popular Tools" title="Most used PDFRoot tools" description="Quick access to everyday PDF, image, and form-ready document tools." />
            <PreviewGrid items={popularTools} />
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="PDF Tools" title="Convert, compress, merge, and organize PDFs" description="Use PDFRoot tools for common PDF workflows across office, school, and upload portals." />
            <PreviewGrid items={pdfTools} />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Image Tools" title="Resize, compress, convert, and prepare images" description="Image utilities for photos, signatures, scans, cards, and online forms." />
            <PreviewGrid items={imageTools} />
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Government Form Tools" title="Tools for recruitment and official forms" description="Prepare exact KB photos, signatures, passport photos, and document card layouts." />
            <PreviewGrid items={governmentTools} />
          </div>
        </section>
        <WhyChoosePdfRoot />
      </main>
      <Footer />
    </>
  );
}
