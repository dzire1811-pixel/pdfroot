import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Download, FileText, ShieldCheck, UploadCloud, Zap } from "lucide-react";
import { BrandPhrase, BrandText, SectionHeading } from "@/components/Brand";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { ToolCard } from "@/components/ToolCard";
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
  const related = tools.filter((item) => item.category === tool.category && item.slug !== tool.slug).slice(0, 6);
  const categoryTools = tool.category === "PDF Tools" ? pdfTools : imageTools;
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
      <main className="overflow-hidden">
        <section className="relative overflow-hidden border-b border-border bg-background px-5 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-12 lg:px-8">
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
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <BrandPhrase text={toolIntro(tool.slug, tool.name)} styled />
            </p>
            {tool.government && <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-primary">{recruitmentCopy}</p>}
          </div>
        </section>

        <section className="border-b border-border bg-background px-5 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-3">
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

        <section className="bg-background px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
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
          <section className="border-y border-border bg-muted/40 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
            <div className="mx-auto max-w-7xl">
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

        <section className="border-y border-border bg-muted/40 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
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

        <section className="bg-background px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
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
        <WhyChoosePdfRoot />
      </main>
      <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter((item) => item.government)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([pageSchema, breadcrumbSchema]),
        }}
      />
    </div>
  );
}
