import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../route-styles.css";
import "../tool-pages.css";
import { Check, ClipboardList, Download, FileLock2, FileText, MonitorSmartphone, ShieldCheck, UploadCloud, Zap } from "lucide-react";
import { BrandPhrase, BrandText, SectionHeading } from "@/components/Brand";
import { CropImageArticle } from "@/components/CropImageArticle";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { MergeResultExploreButton } from "@/components/MergeResultExploreButton";
import { ToolCard } from "@/components/ToolCard";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { ToolFeedback } from "@/components/ToolFeedback";
import { ImageToolsMobileGuard } from "@/components/ImageToolsMobileGuard";
import { ToolRenderer } from "@/components/ToolRenderer";
import { ToolUploadFlowEnhancer } from "@/components/ToolUploadFlowEnhancer";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { filterVisibleTools } from "@/lib/toolVisibility";
import { getToolBySlug, imageTools, pdfTools, recruitmentPlatforms, tools } from "@/lib/tools";
import mobileStyles from "../image-tools-mobile.module.css";

type ToolPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function withUniqueTitleSuffix(title: string, suffix: string) {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titleWithoutSuffix = title.trim().replace(new RegExp(`(?:\\s+${escapedSuffix})+$`, "i"), "").trim();
  return titleWithoutSuffix ? `${titleWithoutSuffix} ${suffix}` : suffix;
}

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

  const pageTitle = withUniqueTitleSuffix(tool.name, "Online");
  const isRrbSignatureResize = tool.slug === "rrb-signature-resize";
  const metadataDescription = isRrbSignatureResize
    ? "Resize your RRB signature online to the required dimensions and file size. Create a clear JPG or JPEG signature for Railway recruitment forms."
    : `${tool.description} Use PDFRoot ${tool.name} online with fast processing, secure files, instant download, and a clean mobile-friendly upload workflow.`;
  const socialDescription = isRrbSignatureResize ? metadataDescription : tool.description;
  const canonicalUrl = isRrbSignatureResize ? "https://www.pdfroot.com/rrb-signature-resize" : `/${tool.slug}`;

  return {
    title: pageTitle,
    description: metadataDescription,
    keywords: tool.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${pageTitle} | PDFRoot`,
      description: socialDescription,
      url: `https://www.pdfroot.com/${tool.slug}`,
      images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${pageTitle} | PDFRoot`,
      description: socialDescription,
      images: ["https://www.pdfroot.com/branding/twitter-card.png"],
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

  const pageTitle = withUniqueTitleSuffix(tool.name, "Online");
  const displayHeading = tool.slug === "image-compressor-for-government-forms" ? "Govt. Form Image Compressor" : pageTitle;
  const supportsStickyToolPanel = tool.category === "Image Tools";
  const related = filterVisibleTools(tools).filter((item) => item.category === tool.category && item.slug !== tool.slug).slice(0, 6);
  const usesApprovedPdfResultPage = tool.slug === "front-back-card-merge" || tool.slug === "resize-image-to-exact-kb" || tool.slug === "compress-image" || tool.slug === "image-compressor-for-government-forms" || tool.slug === "crop-image" || tool.slug === "resize-image" || tool.slug === "jpg-to-png" || tool.slug === "png-to-jpg" || tool.slug === "passport-photo-maker" || tool.slug === "signature-resize-tool" || tool.slug === "ssc-photo-resize" || tool.slug === "rrb-signature-resize" || tool.slug === "ibps-photo-resize" || tool.slug === "ojas-photo-resize" || tool.slug === "gpsc-photo-resize" || tool.slug === "upsc-photo-resize" || tool.slug === "merge-pdf" || tool.slug === "split-pdf" || tool.slug === "compress-pdf" || tool.slug === "pdf-to-word" || tool.slug === "pdf-to-excel" || tool.slug === "pdf-to-powerpoint" || tool.slug === "pdf-to-jpg" || tool.slug === "jpg-to-pdf" || tool.slug === "png-to-pdf" || tool.slug === "word-to-pdf" || tool.slug === "excel-to-pdf" || tool.slug === "powerpoint-to-pdf" || tool.slug === "rotate-pdf" || tool.slug === "organize-pdf-pages" || tool.slug === "delete-pdf-pages" || tool.slug === "watermark-pdf" || tool.slug === "crop-pdf" || tool.slug === "protect-pdf" || tool.slug === "unlock-pdf";
  const resultPrimaryActions = tool.slug === "upsc-photo-resize"
    ? [
        ["crop-image", "Crop Image", "Crop photos for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "gpsc-photo-resize"
    ? [
        ["crop-image", "Crop Image", "Crop photos for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "ojas-photo-resize"
    ? [
        ["crop-image", "Crop Image", "Crop photos for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "ibps-photo-resize"
    ? [
        ["crop-image", "Crop Image", "Crop documents for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "rrb-signature-resize"
    ? [
        ["crop-image", "Crop Image", "Crop signatures for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "ssc-photo-resize"
    ? [
        ["crop-image", "Crop Image", "Crop signatures for online forms."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
      ]
    : tool.slug === "image-compressor-for-government-forms"
    ? [
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
      ]
    : tool.slug === "signature-resize-tool"
    ? [
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
      ]
    : tool.slug === "passport-photo-maker"
    ? [
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
      ]
    : tool.slug === "png-to-jpg"
    ? [
        ["jpg-to-png", "JPG to PNG", "Convert JPG photos into PNG images."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["resize-image", "Resize Image", "Change image width and height."],
      ]
    : tool.slug === "jpg-to-png"
    ? [
        ["png-to-jpg", "PNG to JPG", "Convert PNG images into JPG format."],
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["resize-image", "Resize Image", "Change image width and height."],
      ]
    : tool.slug === "resize-image"
    ? [
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
      ]
    : tool.slug === "crop-image" || tool.slug === "front-back-card-merge"
    ? [
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["resize-image", "Resize Image", "Change image width and height."],
      ]
    : tool.slug === "compress-image"
    ? [
        ["resize-image-to-exact-kb", "Resize to Exact KB", "Prepare an image for an exact upload limit."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
        ["resize-image", "Resize Image", "Change image width and height."],
      ]
    : tool.slug === "resize-image-to-exact-kb"
    ? [
        ["compress-image", "Compress Image", "Reduce image size for easier uploads."],
        ["crop-image", "Crop Image", "Crop photos for forms and documents."],
        ["resize-image", "Resize Image", "Change image width and height."],
      ]
    : tool.slug === "split-pdf"
    ? [
        ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
        ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ["pdf-to-word", "Convert PDF", "Turn your PDF into another format."],
      ]
    : tool.slug === "compress-pdf"
      ? [
          ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
          ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
          ["pdf-to-word", "Convert PDF", "Turn your PDF into another format."],
        ]
    : tool.slug === "pdf-to-word"
      ? [
          ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
          ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
          ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ]
    : tool.slug === "pdf-to-excel"
      ? [
          ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
          ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
          ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ]
    : tool.slug === "pdf-to-powerpoint"
      ? [
          ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
          ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
          ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ]
    : tool.slug === "pdf-to-jpg" || tool.slug === "jpg-to-pdf" || tool.slug === "png-to-pdf" || tool.slug === "word-to-pdf" || tool.slug === "excel-to-pdf" || tool.slug === "powerpoint-to-pdf" || tool.slug === "rotate-pdf" || tool.slug === "organize-pdf-pages" || tool.slug === "delete-pdf-pages" || tool.slug === "watermark-pdf" || tool.slug === "crop-pdf"
      ? [
          ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
          ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
          ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ]
    : [
        ["compress-pdf", "Compress PDF", "Reduce file size for easier sharing."],
        ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
        ["pdf-to-word", "Convert PDF", "Turn your PDF into another format."],
      ];
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
    name: pageTitle,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    url: `https://www.pdfroot.com/${tool.slug}`,
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
        item: "https://www.pdfroot.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: tool.name,
        item: `https://www.pdfroot.com/${tool.slug}`,
      },
    ],
  };

  return (
    <div
      data-image-tool-page={tool.category === "Image Tools" ? "true" : undefined}
      className={`v0-homepage v0-tool-page min-h-screen bg-background text-foreground ${tool.category === "Image Tools" ? mobileStyles.imageToolPage : ""}`}
    >
      {tool.slug === "resize-image" && (
        <style>{`
          .v0-tool-page:has(#resize-image-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#resize-image-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "front-back-card-merge" && (
        <style>{`
          .v0-tool-page:has(#front-back-card-merge-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#front-back-card-merge-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
          .v0-tool-page:has(#front-back-card-merge-tool [data-workflow-step="download"]) [data-tool-workspace-hero] {
            border-bottom: 0 !important;
            padding-bottom: 26px !important;
          }
          .v0-tool-page:has(#front-back-card-merge-tool [data-workflow-step="download"]) > main {
            overflow: visible !important;
          }
        `}</style>
      )}
      {tool.slug === "jpg-to-png" && (
        <style>{`
          .v0-tool-page:has(#jpg-to-png-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#jpg-to-png-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "png-to-jpg" && (
        <style>{`
          .v0-tool-page:has(#png-to-jpg-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#png-to-jpg-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "passport-photo-maker" && (
        <style>{`
          .v0-tool-page:has(#passport-photo-maker-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#passport-photo-maker-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "signature-resize-tool" && (
        <style>{`
          .v0-tool-page:has(#signature-resize-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#signature-resize-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "image-compressor-for-government-forms" && (
        <style>{`
          .v0-tool-page:has(#government-image-compressor-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#government-image-compressor-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "ssc-photo-resize" && (
        <style>{`
          .v0-tool-page:has(#ssc-signature-resize-tool [data-workflow-step="download"]) main > [data-tool-page-extra],
          .v0-tool-page:has(#ssc-signature-resize-tool [data-workflow-step="download"]) > [data-tool-page-extra="footer"] {
            display: none !important;
          }
          .v0-tool-page:has(#ssc-signature-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="intro"],
          .v0-tool-page:has(#ssc-signature-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="recruitment-intro"] {
            display: none !important;
          }
          .v0-tool-page:has(#ssc-signature-resize-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "rrb-signature-resize" && (
        <style>{`
          .v0-tool-page:has(#rrb-signature-resize-tool [data-workflow-step="download"]) main > [data-tool-page-extra],
          .v0-tool-page:has(#rrb-signature-resize-tool [data-workflow-step="download"]) > [data-tool-page-extra="footer"],
          .v0-tool-page:has(#rrb-signature-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="intro"],
          .v0-tool-page:has(#rrb-signature-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="recruitment-intro"] {
            display: none !important;
          }
          .v0-tool-page:has(#rrb-signature-resize-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "ibps-photo-resize" && (
        <style>{`
          .v0-tool-page:has(#ibps-document-resize-tool [data-workflow-step="download"]) main > [data-tool-page-extra],
          .v0-tool-page:has(#ibps-document-resize-tool [data-workflow-step="download"]) > [data-tool-page-extra="footer"],
          .v0-tool-page:has(#ibps-document-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="intro"],
          .v0-tool-page:has(#ibps-document-resize-tool [data-workflow-step="download"]) [data-tool-page-extra="recruitment-intro"] {
            display: none !important;
          }
          .v0-tool-page:has(#ibps-document-resize-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "ojas-photo-resize" && (
        <style>{`
          .v0-tool-page:has(#ojas-photo-signature-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#ojas-photo-signature-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "gpsc-photo-resize" && (
        <style>{`
          .v0-tool-page:has(#gpsc-photo-signature-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#gpsc-photo-signature-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      {tool.slug === "upsc-photo-resize" && (
        <style>{`
          .v0-tool-page:has(#upsc-document-resize-tool [data-workflow-step="download"]) [data-tool-page-extra] {
            display: none !important;
          }
          .v0-tool-page:has(#upsc-document-resize-tool [data-workflow-step="download"]) [data-merge-result-only] {
            display: block !important;
          }
        `}</style>
      )}
      <ToolUploadFlowEnhancer />
      {tool.category === "Image Tools" && <ImageToolsMobileGuard />}
      <HomepageSiteHeader />
      <main className={supportsStickyToolPanel ? "overflow-visible" : "overflow-hidden"}>
        <section data-tool-workspace-hero className={`relative border-b border-border bg-background px-6 pb-12 pt-10 sm:pb-14 sm:pt-12 lg:px-8 ${supportsStickyToolPanel ? "overflow-visible" : "overflow-hidden"}`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-white bg-[radial-gradient(ellipse_at_8%_14%,rgba(255,45,45,0.065)_0%,rgba(255,45,45,0.025)_24%,transparent_48%),radial-gradient(ellipse_at_92%_18%,rgba(59,130,246,0.06)_0%,rgba(59,130,246,0.022)_26%,transparent_50%),radial-gradient(ellipse_at_52%_78%,rgba(255,45,45,0.025)_0%,transparent_44%)]"
          />
          <div className="relative mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <ToolDirectoryIcon tool={tool} />
              {tool.category}
            </div>
            <h1 className={`mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl ${tool.slug === "image-compressor-for-government-forms" ? "lg:max-w-5xl lg:whitespace-nowrap" : ""}`}>
              {displayHeading}
            </h1>
            <ToolRenderer slug={tool.slug} name={tool.name} description={tool.description} />
            <p data-tool-page-extra="intro" className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <BrandPhrase text={toolIntro(tool.slug, tool.name)} styled />
            </p>
            {tool.government && <p data-tool-page-extra="recruitment-intro" className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-primary">{recruitmentCopy}</p>}
          </div>
        </section>

        {usesApprovedPdfResultPage && (
          <>
            <ToolFeedback toolName={tool.name} toolSlug={tool.slug} />

            <section data-merge-result-only="related" className="h-auto overflow-visible bg-muted/40 px-4 pb-2 pt-2 sm:px-6 lg:px-8">
              <div className="mx-auto h-auto max-w-[1040px] overflow-visible rounded-2xl border border-border bg-card px-4 py-4 shadow-sm shadow-foreground/[0.03] sm:px-5">
                <div role="heading" aria-level={2} className="text-lg font-semibold leading-snug tracking-tight text-foreground">
                  What would you like to do next?
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {resultPrimaryActions.map(([itemSlug, label, description]) => {
                    const item = related.find((relatedTool) => relatedTool.slug === itemSlug);
                    if (!item) return null;

                    return (
                      <Link
                        key={item.slug}
                        href={`/${item.slug}`}
                        style={getToolRowTintStyle(item.slug)}
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3 transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-[var(--tool-row-tint)]"
                      >
                        <span className="shrink-0">
                          <ToolDirectoryIcon tool={item} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-normal leading-tight text-foreground">{label}</span>
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2.5">
                  {related
                    .filter((item) => !resultPrimaryActions.some(([itemSlug]) => itemSlug === item.slug))
                    .map((item) => (
                      <Link
                        key={item.slug}
                        href={`/${item.slug}`}
                        style={getToolRowTintStyle(item.slug)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-normal text-foreground transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-[var(--tool-row-tint)]"
                      >
                        <ToolDirectoryIcon tool={item} />
                        {item.name}
                      </Link>
                    ))}
                </div>
                <div className="mt-4 flex justify-center">
                  <MergeResultExploreButton category={tool.category} />
                </div>
              </div>
            </section>

            <section data-merge-result-only="trust" className="bg-muted/40 px-6 pb-4 pt-14 lg:px-8">
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
                      <span className="text-4xl font-bold text-muted-foreground">0{index + 1}</span>
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
        {tool.slug === "crop-image" && <CropImageArticle />}
      </main>
      {usesApprovedPdfResultPage && (
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
