import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Download, FileText, ShieldCheck, UploadCloud, Zap } from "lucide-react";
import { BrandPhrase, BrandText, LogoMark, SectionHeading } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialLinks } from "@/components/SocialLinks";
import { ToolCard } from "@/components/ToolCard";
import { UploadBox } from "@/components/UploadBox";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { ResizeImageExactKbTool } from "@/components/ResizeImageExactKbTool";
import { CompressImageTool } from "@/components/CompressImageTool";
import { JpgToPngTool } from "@/components/JpgToPngTool";
import { PngToJpgTool } from "@/components/PngToJpgTool";
import { CropImageTool } from "@/components/CropImageTool";
import { ResizeImageTool } from "@/components/ResizeImageTool";
import { JpgToPdfTool } from "@/components/JpgToPdfTool";
import { PdfToJpgTool } from "@/components/PdfToJpgTool";
import { MergePdfTool } from "@/components/MergePdfTool";
import { CompressPdfTool } from "@/components/CompressPdfTool";
import { SplitPdfTool } from "@/components/SplitPdfTool";
import { RotatePdfTool } from "@/components/RotatePdfTool";
import { ProtectPdfTool } from "@/components/ProtectPdfTool";
import { UnlockPdfTool } from "@/components/UnlockPdfTool";
import { WatermarkPdfTool } from "@/components/WatermarkPdfTool";
import { DeletePdfPagesTool } from "@/components/DeletePdfPagesTool";
import { OrganizePdfPagesTool } from "@/components/OrganizePdfPagesTool";
import { CropPdfTool } from "@/components/CropPdfTool";
import { PdfToWordTool } from "@/components/PdfToWordTool";
import { WordToPdfTool } from "@/components/WordToPdfTool";
import { ExcelToPdfTool } from "@/components/ExcelToPdfTool";
import { PdfToExcelTool } from "@/components/PdfToExcelTool";
import { PowerPointToPdfTool } from "@/components/PowerPointToPdfTool";
import { PdfToPowerPointTool } from "@/components/PdfToPowerPointTool";
import { SignatureResizeTool } from "@/components/SignatureResizeTool";
import { PassportPhotoMakerTool } from "@/components/PassportPhotoMakerTool";
import { SscPhotoSignatureHelperTool } from "@/components/SscPhotoSignatureHelperTool";
import { RrbPhotoSignatureHelperTool } from "@/components/RrbPhotoSignatureHelperTool";
import { IbpsPhotoSignatureHelperTool } from "@/components/IbpsPhotoSignatureHelperTool";
import { OjasPhotoSignatureTool } from "@/components/OjasPhotoSignatureTool";
import { GpscPhotoSignatureTool, UpscPhotoSignatureTool } from "@/components/GpscPhotoSignatureTool";
import { FrontBackCardMergeTool } from "@/components/FrontBackCardMergeTool";
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

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-5 py-10 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <LogoMark />
          <p className="mt-4 max-w-md leading-7 text-slate-600"><BrandText /> - Smart PDF & Image Toolkit.</p>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:border-red-200 hover:text-[#FF2D2D]">
          Back to all tools
          <ArrowRight className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
        </Link>
        <div className="flex flex-col gap-4 sm:items-end">
          <div className="flex flex-wrap justify-center gap-4 text-sm font-black text-slate-700 sm:justify-end">
            <Link href="/about" className="transition hover:text-[#FF2D2D]">
              About <BrandText />
            </Link>
            <Link href="/contact" className="transition hover:text-[#FF2D2D]">
              Contact
            </Link>
          </div>
          <SocialLinks className="sm:justify-end" linkClassName="text-slate-500 hover:text-[#FF2D2D]" />
        </div>
      </div>
    </footer>
  );
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
    <>
      <SiteHeader />
      <main className="min-h-screen overflow-hidden bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-12 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tool.category}
            </div>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              {tool.name} Online
            </h1>
            {tool.slug === "resize-image-to-exact-kb" ? (
              <ResizeImageExactKbTool />
            ) : tool.slug === "compress-image" || tool.slug === "image-compressor-for-government-forms" ? (
              <CompressImageTool />
            ) : tool.slug === "jpg-to-png" ? (
              <JpgToPngTool />
            ) : tool.slug === "png-to-jpg" ? (
              <PngToJpgTool />
            ) : tool.slug === "crop-image" ? (
              <CropImageTool />
            ) : tool.slug === "resize-image" ? (
              <ResizeImageTool />
            ) : tool.slug === "jpg-to-pdf" || tool.slug === "png-to-pdf" ? (
              <JpgToPdfTool />
            ) : tool.slug === "pdf-to-jpg" ? (
              <PdfToJpgTool />
            ) : tool.slug === "merge-pdf" ? (
              <MergePdfTool />
            ) : tool.slug === "compress-pdf" ? (
              <CompressPdfTool />
            ) : tool.slug === "split-pdf" ? (
              <SplitPdfTool />
            ) : tool.slug === "rotate-pdf" ? (
              <RotatePdfTool />
            ) : tool.slug === "protect-pdf" ? (
              <ProtectPdfTool />
            ) : tool.slug === "unlock-pdf" ? (
              <UnlockPdfTool />
            ) : tool.slug === "watermark-pdf" ? (
              <WatermarkPdfTool />
            ) : tool.slug === "delete-pdf-pages" ? (
              <DeletePdfPagesTool />
            ) : tool.slug === "organize-pdf-pages" ? (
              <OrganizePdfPagesTool />
            ) : tool.slug === "crop-pdf" ? (
              <CropPdfTool />
            ) : tool.slug === "pdf-to-word" ? (
              <PdfToWordTool />
            ) : tool.slug === "word-to-pdf" ? (
              <WordToPdfTool />
            ) : tool.slug === "excel-to-pdf" ? (
              <ExcelToPdfTool />
            ) : tool.slug === "pdf-to-excel" ? (
              <PdfToExcelTool />
            ) : tool.slug === "powerpoint-to-pdf" ? (
              <PowerPointToPdfTool />
            ) : tool.slug === "pdf-to-powerpoint" ? (
              <PdfToPowerPointTool />
            ) : tool.slug === "signature-resize-tool" ? (
              <SignatureResizeTool />
            ) : tool.slug === "passport-photo-maker" ? (
              <PassportPhotoMakerTool />
            ) : tool.slug === "ssc-photo-resize" ? (
              <SscPhotoSignatureHelperTool />
            ) : tool.slug === "rrb-photo-resize" ? (
              <RrbPhotoSignatureHelperTool />
            ) : tool.slug === "ibps-photo-resize" ? (
              <IbpsPhotoSignatureHelperTool />
            ) : tool.slug === "ojas-photo-resize" ? (
              <OjasPhotoSignatureTool />
            ) : tool.slug === "gpsc-photo-resize" ? (
              <GpscPhotoSignatureTool />
            ) : tool.slug === "upsc-photo-resize" ? (
              <UpscPhotoSignatureTool />
            ) : tool.slug === "front-back-card-merge" ? (
              <FrontBackCardMergeTool />
            ) : (
              <div className="mx-auto mt-6 max-w-2xl">
                <UploadBox title={`Upload for ${tool.name}`} description={tool.description} restoreTransferredFiles />
              </div>
            )}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              <BrandPhrase text={toolIntro(tool.slug, tool.name)} />
            </p>
            {tool.government && <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-red-700">{recruitmentCopy}</p>}
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white px-5 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-3">
            {["Secure Files", "Fast Processing", "Instant Download"].map((item) => (
              <div key={item} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm">
                <CheckCircle2 className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
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
                  <div key={title as string} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                        <Step className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="text-4xl font-black text-slate-100">0{index + 1}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-black text-slate-950">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      <BrandPhrase text={description as string} />
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {tool.government && (
          <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <SectionHeading
                eyebrow="Government Recruitment Support"
                title={`${tool.name} for SSC, RRB, IBPS, OJAS, UPSC and GPSC`}
                description="Prepare photos, signatures, and compressed images for recruitment portals, banking exams, railway applications, police recruitment, scholarship forms, and government job applications."
              />
              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {recruitmentPlatforms.map((platform) => (
                  <div key={platform} className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm font-black text-slate-800 shadow-sm">
                    {platform}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF2D2D]">SEO Tool Page</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Why use <BrandText /> {tool.name}?</h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                {tool.description} <BrandText /> gives this workflow its own dedicated page so users can find the exact PDF or image tool they need from search and navigation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {tool.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
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
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                  <ShieldCheck className="h-7 w-7 text-[#FF2D2D]" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    <BrandPhrase text={description} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
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
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([pageSchema, breadcrumbSchema]),
        }}
      />
    </>
  );
}
