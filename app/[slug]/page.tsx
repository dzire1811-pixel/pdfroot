import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ClipboardList, Download, FileLock2, FileText, MonitorSmartphone, ShieldCheck, UploadCloud, Zap } from "lucide-react";
import { BrandPhrase, BrandText, SectionHeading } from "@/components/Brand";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { MergeResultExploreButton } from "@/components/MergeResultExploreButton";
import { ToolCard } from "@/components/ToolCard";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { ToolRenderer } from "@/components/ToolRenderer";
import { ToolUploadFlowEnhancer } from "@/components/ToolUploadFlowEnhancer";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { getToolBySlug, imageTools, pdfTools, recruitmentPlatforms, tools } from "@/lib/tools";

type ToolPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return tools.map((tool) => ({
    slug: tool.slug,
  }));
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);

  if (!tool) {
    return {};
  }

  return {
    title: `${tool.name} Online`,
    description: `${tool.description} Use PDFRoot ${tool.name} online with fast processing, secure files, instant download, and a clean mobile-friendly upload workflow.`,
    keywords: tool.keywords,
    alternates: {
      canonical: `/${tool.slug}`,
    },
    openGraph: {
      title: `${tool.name} Online | PDFRoot`,
      description: tool.description,
      url: `https://pdfroot.com/${tool.slug}`,
      images: ["/pdfroot-og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${tool.name} Online | PDFRoot`,
      description: tool.description,
      images: ["/pdfroot-og-image.png"],
    },
  };
}

const recruitmentCopy =
  "Useful for SSC, RRB, IBPS, OJAS, UPSC, GPSC, Railway, Police Recruitment, Banking Exams, Scholarship Forms, admission portals, and government job applications with strict upload limits.";

function toolIntro(slug: string, name: string) {
  if (slug === "resize-image-to-exact-kb") {
    return "Resize photos, signatures, scanned documents, and application images to exact KB sizes such as 20KB, 50KB, 100KB, 200KB, or a custom size.";
  }

  if (slug === "compress-image" || slug === "image-compressor-for-government-forms") {
    return "Compress images for online forms, document uploads, websites, and recruitment portals while keeping the workflow simple and mobile friendly.";
  }

  if (slug === "jpg-to-pdf" || slug === "png-to-pdf") {
    return `Use PDFRoot ${name} to turn photos, scans, and image files into clean PDF documents for upload, sharing, printing, or official submissions.`;
  }

  if (slug === "pdf-to-jpg") {
    return "Convert PDF pages into high-quality JPG images for previews, sharing, web uploads, and form workflows.";
  }

  if (slug.includes("pdf")) {
    return `Use PDFRoot ${name} to process PDF files online with a clean, secure, and fast document workflow.`;
  }

  return `Use PDFRoot ${name} to prepare images online with fast processing, clear controls, and mobile-friendly upload.`;
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);

  if (!tool) {
    notFound();
  }

  const Icon = tool.icon;
  const supportsStickyToolPanel = tool.category === "Image Tools";
  const related = tools.filter((item) => item.category === tool.category && item.slug !== tool.slug).slice(0, 6);
  const categoryTools = tool.category === "PDF Tools" ? pdfTools : imageTools;
  const mergeResultTrustCards = [
    ["Files Processed Locally", FileLock2],
    ["Fast & Free PDF & Image Tools", Zap],
    ["Works on Mobile & Desktop", MonitorSmartphone],
    ["Perfect for Government Forms & Document Uploads", ClipboardList],
    ["Secure File Processing", ShieldCheck],
  ] as const;
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${tool.name} Online`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    url: `https://pdfroot.com/${tool.slug}`,
    description: tool.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://pdfroot.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: tool.name,
        item: `https://pdfroot.com/${tool.slug}`,
      },
    ],
  };

  return (
    <div className="v0-homepage v0-tool-page min-h-screen bg-background text-foreground">
      <ToolUploadFlowEnhancer />
      <HomepageSiteHeader />
      <main className={supportsStickyToolPanel ? "overflow-visible" : "overflow-hidden"}>
        <section data-tool-workspace-hero className={`relative border-b border-border bg-background px-6 pb-12 pt-10 sm:pb-14 sm:pt-12 lg:px-8 ${supportsStickyToolPanel ? "overflow-visible" : "overflow-hidden"}`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.92_0_0/0.5)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0_0/0.5)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          />
          <div className="relative mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tool.category}
            </div>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {tool.name} Online
            </h1>
            <ToolRenderer slug={tool.slug} name={tool.name} description={tool.description} />
            <p data-tool-page-extra="intro" className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <BrandPhrase text={toolIntro(tool.slug, tool.name)} styled />
            </p>
            {tool.government && <p data-tool-page-extra="recruitment-intro" className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-primary">{recruitmentCopy}</p>}
          </div>
        </section>

        {tool.slug === "merge-pdf" && (
          <>
            <section data-merge-result-only="related" className="h-auto overflow-visible bg-muted/40 px-4 pb-2 pt-2 sm:px-6 lg:px-8">
              <div className="mx-auto h-auto max-w-[1040px] overflow-visible rounded-2xl border border-border bg-card px-4 py-4 shadow-sm shadow-foreground/[0.03] sm:px-5">
                <div role="heading" aria-level={2} className="text-lg font-semibold leading-snug tracking-tight text-foreground">
                  What would you like to do next?
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
                    ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
                    ["pdf-to-word", "Convert PDF", "Turn your PDF into another format."],
                  ].map(([itemSlug, label, description]) => {
                    const item = related.find((relatedTool) => relatedTool.slug === itemSlug);
                    if (!item) return null;

                    return (
                      <Link
                        key={item.slug}
                        href={`/${item.slug}`}
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3 transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[#F3F4F6] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        <span className="shrink-0">
                          <ToolDirectoryIcon tool={item} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-tight text-foreground">{label}</span>
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2.5">
                  {related
                    .filter((item) => !["compress-pdf", "split-pdf", "pdf-to-word"].includes(item.slug))
                    .map((item) => (
                      <Link
                        key={item.slug}
                        href={`/${item.slug}`}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[#F3F4F6] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        {item.name}
                      </Link>
                    ))}
                </div>
                <div className="mt-4 flex justify-center">
                  <MergeResultExploreButton />
                </div>
              </div>
            </section>

            <section data-merge-result-only="trust" className="bg-muted/40 px-6 pb-[72px] pt-14 lg:px-8">
              <div className="mx-auto max-w-[1100px]">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Why Choose PDFRoot?</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Fast, secure tools for everyday documents</h2>
                </div>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                  {mergeResultTrustCards.map(([title, TrustIcon]) => (
                    <div key={title} className="flex min-h-[76px] items-center gap-2.5 rounded-lg border border-border bg-card p-3 lg:min-h-[96px] lg:flex-col lg:justify-center lg:gap-2 lg:px-2.5 lg:py-3 lg:text-center">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-primary">
                        <TrustIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      </span>
                      <h3 className="text-xs font-semibold leading-snug text-foreground">{title}</h3>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        <section data-tool-page-extra="trust" className="border-b border-border bg-background px-6 py-5 lg:px-8">
          <div className="mx-auto flex max-w-[1800px] flex-wrap justify-center gap-3">
            {["Secure Files", "Fast Processing", "Instant Download"].map((item) => (
              <div key={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section data-tool-page-extra="how-to" className="bg-background px-6 py-14 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-[1800px]">
            <SectionHeading
              eyebrow="How It Works"
              title={`Use ${tool.name} in three steps`}
              description="PDFRoot keeps every tool simple: upload files, process instantly, and download the result."
            />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                ["Upload File", "Choose a PDF, image, photo, signature, or supported document file.", UploadCloud],
                ["Process Instantly", "Use optimized PDFRoot processing for fast online results.", Zap],
                ["Download Result", "Save the converted, compressed, merged, resized, or edited file.", Download],
              ].map(([title, description, StepIcon], index) => {
                const Step = StepIcon as typeof FileText;
                return (
                  <div key={title as string} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Step className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="text-4xl font-bold text-muted">0{index + 1}</span>
                    </div>
                    <h3 className="mt-6 text-base font-semibold text-foreground">{title as string}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      <BrandPhrase text={description as string} styled />
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {tool.government && (
          <section data-tool-page-extra="government" className="border-y border-border bg-muted/40 px-6 py-14 sm:py-16 lg:px-8">
            <div className="mx-auto max-w-[1800px]">
              <SectionHeading
                eyebrow="Government Recruitment Support"
                title={`${tool.name} for SSC, RRB, IBPS, OJAS, UPSC and GPSC`}
                description="Prepare photos, signatures, and compressed images for recruitment portals, banking exams, railway applications, police recruitment, scholarship forms, and government job applications."
              />
              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {recruitmentPlatforms.map((platform) => (
                  <div key={platform} className="rounded-full border border-border bg-card px-3 py-2 text-center text-xs font-semibold text-foreground">
                    {platform}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section data-tool-page-extra="seo" className="border-y border-border bg-muted/40 px-6 py-14 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-[1800px] gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-card p-7">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">SEO Tool Page</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Why use <BrandText styled /> {tool.name}?</h2>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                {tool.description} <BrandText styled /> gives this workflow its own dedicated page so users can find the exact PDF or image tool they need from search and navigation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {tool.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Professional workflow", "Clear upload, processing, and download stages for real users."],
                ["Mobile-first design", "Designed to work smoothly across phones, tablets, and desktops."],
                ["Secure experience", "Trust-focused UI for document and image handling."],
                ["Complete platform", `Part of ${categoryTools.length} ${tool.category.toLowerCase()} inside PDFRoot.`],
              ].map(([title, description]) => (
                <div key={title} className="flex flex-col rounded-2xl border border-border bg-card p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <BrandPhrase text={description} styled />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section data-tool-page-extra="related" className="bg-background px-6 py-14 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-[1800px]">
            <SectionHeading
              eyebrow="Related Tools"
              title={`More ${tool.category}`}
              description="Continue working with nearby PDFRoot tools from the same toolkit category."
            />
            <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {related.map((item) => (
                <ToolCard key={item.slug} tool={item} compact />
              ))}
            </div>
          </div>
        </section>
        <div data-tool-page-extra="why-choose">
          <WhyChoosePdfRoot />
        </div>
      </main>
      {tool.slug === "merge-pdf" && (
        <div data-merge-result-only="footer">
          <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((item) => item.government)} />
        </div>
      )}
      <div data-tool-page-extra="footer">
        <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((item) => item.government)} />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([pageSchema, breadcrumbSchema]),
        }}
      />
    </div>
  );
}
