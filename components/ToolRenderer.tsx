"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type MouseEvent } from "react";
import { UploadBox } from "@/components/UploadBox";

function ToolLoadingFallback() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto mt-6 grid min-h-[17rem] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:min-h-[21rem] sm:w-[min(calc(100vw-3rem),64rem)]"
    >
      <div>
        <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-red-100 border-t-[#FF2D2D]" aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Loading tool…</p>
      </div>
    </section>
  );
}

const ResizeImageExactKbTool = dynamic(() => import("@/components/ResizeImageExactKbTool").then((module) => module.ResizeImageExactKbTool), { loading: ToolLoadingFallback });
const CompressImageTool = dynamic(() => import("@/components/CompressImageTool").then((module) => module.CompressImageTool), { loading: ToolLoadingFallback });
const JpgToPngTool = dynamic(() => import("@/components/JpgToPngTool").then((module) => module.JpgToPngTool), { loading: ToolLoadingFallback });
const PngToJpgTool = dynamic(() => import("@/components/PngToJpgTool").then((module) => module.PngToJpgTool), { loading: ToolLoadingFallback });
const BackgroundRemoverTool = dynamic(() => import("@/components/BackgroundRemoverTool").then((module) => module.BackgroundRemoverTool), { loading: ToolLoadingFallback });
const CropImageTool = dynamic(() => import("@/components/CropImageTool").then((module) => module.CropImageTool), { loading: ToolLoadingFallback, ssr: false });
const ResizeImageTool = dynamic(() => import("@/components/ResizeImageTool").then((module) => module.ResizeImageTool), { loading: ToolLoadingFallback });
const JpgToPdfTool = dynamic(() => import("@/components/JpgToPdfTool").then((module) => module.JpgToPdfTool), { loading: ToolLoadingFallback });
const PdfToJpgTool = dynamic(() => import("@/components/PdfToJpgTool").then((module) => module.PdfToJpgTool), { loading: ToolLoadingFallback });
const MergePdfTool = dynamic(() => import("@/components/MergePdfTool").then((module) => module.MergePdfTool), { loading: ToolLoadingFallback });
const CompressPdfTool = dynamic(() => import("@/components/CompressPdfTool").then((module) => module.CompressPdfTool), { loading: ToolLoadingFallback });
const SplitPdfTool = dynamic(() => import("@/components/SplitPdfTool").then((module) => module.SplitPdfTool), { loading: ToolLoadingFallback });
const RotatePdfTool = dynamic(() => import("@/components/RotatePdfTool").then((module) => module.RotatePdfTool), { loading: ToolLoadingFallback });
const ProtectPdfTool = dynamic(() => import("@/components/ProtectPdfTool").then((module) => module.ProtectPdfTool), { loading: ToolLoadingFallback });
const UnlockPdfTool = dynamic(() => import("@/components/UnlockPdfTool").then((module) => module.UnlockPdfTool), { loading: ToolLoadingFallback });
const WatermarkPdfTool = dynamic(() => import("@/components/WatermarkPdfTool").then((module) => module.WatermarkPdfTool), { loading: ToolLoadingFallback });
const DeletePdfPagesTool = dynamic(() => import("@/components/DeletePdfPagesTool").then((module) => module.DeletePdfPagesTool), { loading: ToolLoadingFallback });
const OrganizePdfPagesTool = dynamic(() => import("@/components/OrganizePdfPagesTool").then((module) => module.OrganizePdfPagesTool), { loading: ToolLoadingFallback });
const CropPdfTool = dynamic(() => import("@/components/CropPdfTool").then((module) => module.CropPdfTool), { loading: ToolLoadingFallback });
const PdfToWordTool = dynamic(() => import("@/components/PdfToWordTool").then((module) => module.PdfToWordTool), { loading: ToolLoadingFallback });
const WordToPdfTool = dynamic(() => import("@/components/WordToPdfTool").then((module) => module.WordToPdfTool), { loading: ToolLoadingFallback });
const ExcelToPdfTool = dynamic(() => import("@/components/ExcelToPdfTool").then((module) => module.ExcelToPdfTool), { loading: ToolLoadingFallback });
const PdfToExcelTool = dynamic(() => import("@/components/PdfToExcelTool").then((module) => module.PdfToExcelTool), { loading: ToolLoadingFallback });
const PowerPointToPdfTool = dynamic(() => import("@/components/PowerPointToPdfTool").then((module) => module.PowerPointToPdfTool), { loading: ToolLoadingFallback });
const PdfToPowerPointTool = dynamic(() => import("@/components/PdfToPowerPointTool").then((module) => module.PdfToPowerPointTool), { loading: ToolLoadingFallback });
const SignatureResizeTool = dynamic(() => import("@/components/SignatureResizeTool").then((module) => module.SignatureResizeTool), { loading: ToolLoadingFallback });
const PassportPhotoMakerTool = dynamic(() => import("@/components/PassportPhotoMakerTool").then((module) => module.PassportPhotoMakerTool), { loading: ToolLoadingFallback });
const SscPhotoSignatureHelperTool = dynamic(() => import("@/components/SscPhotoSignatureHelperTool").then((module) => module.SscPhotoSignatureHelperTool), { loading: ToolLoadingFallback });
const RrbPhotoSignatureHelperTool = dynamic(() => import("@/components/RrbPhotoSignatureHelperTool").then((module) => module.RrbPhotoSignatureHelperTool), { loading: ToolLoadingFallback });
const IbpsPhotoSignatureHelperTool = dynamic(() => import("@/components/IbpsPhotoSignatureHelperTool").then((module) => module.IbpsPhotoSignatureHelperTool), { loading: ToolLoadingFallback });
const OjasPhotoSignatureTool = dynamic(() => import("@/components/OjasPhotoSignatureTool").then((module) => module.OjasPhotoSignatureTool), { loading: ToolLoadingFallback });
const GpscPhotoSignatureTool = dynamic(() => import("@/components/GpscPhotoSignatureTool").then((module) => module.GpscPhotoSignatureTool), { loading: ToolLoadingFallback });
const UpscPhotoSignatureTool = dynamic(() => import("@/components/GpscPhotoSignatureTool").then((module) => module.UpscPhotoSignatureTool), { loading: ToolLoadingFallback });
const FrontBackCardMergeTool = dynamic(() => import("@/components/FrontBackCardMergeTool").then((module) => module.FrontBackCardMergeTool), { loading: ToolLoadingFallback, ssr: false });

const IMAGE_TOOL_SLUGS = new Set([
  "resize-image-to-exact-kb",
  "compress-image",
  "image-compressor-for-government-forms",
  "jpg-to-png",
  "png-to-jpg",
  "background-remover",
  "crop-image",
  "resize-image",
  "signature-resize-tool",
  "passport-photo-maker",
  "ssc-photo-resize",
  "rrb-signature-resize",
  "ibps-photo-resize",
  "ojas-photo-resize",
  "gpsc-photo-resize",
  "upsc-photo-resize",
  "front-back-card-merge",
]);
const INTERACTION_DEFERRED_SLUGS = new Set(["crop-image", "front-back-card-merge"]);

function isImageToolResetLabel(label: string) {
  return label === "clear" || label === "clear all" || label === "start over" || /\banother\b/.test(label);
}

export function ToolRenderer({ slug, name, description }: { slug: string; name: string; description: string }) {
  const [resetVersion, setResetVersion] = useState(0);
  const [isInteractiveToolReady, setIsInteractiveToolReady] = useState(
    () => !INTERACTION_DEFERRED_SLUGS.has(slug),
  );

  useEffect(() => {
    if (!INTERACTION_DEFERRED_SLUGS.has(slug)) {
      setIsInteractiveToolReady(true);
      return;
    }

    let idleId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reveal = () => setIsInteractiveToolReady(true);
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(reveal, { timeout: 2500 });
    } else {
      timer = globalThis.setTimeout(reveal, 0);
    }

    return () => {
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer !== null) globalThis.clearTimeout(timer);
    };
  }, [slug]);

  function onToolClick(event: MouseEvent<HTMLDivElement>) {
    if (!IMAGE_TOOL_SLUGS.has(slug)) return;

    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const label = button?.textContent?.replace(/\s+/g, " ").trim().toLowerCase();
    if (!button || !label || !isImageToolResetLabel(label)) return;

    setResetVersion((version) => version + 1);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    });
  }

  const renderTool = () => {
  if (!isInteractiveToolReady) return <ToolLoadingFallback />;
  if (slug === "resize-image-to-exact-kb") return <ResizeImageExactKbTool />;
  if (slug === "compress-image" || slug === "image-compressor-for-government-forms") return <CompressImageTool governmentForms={slug === "image-compressor-for-government-forms"} />;
  if (slug === "jpg-to-png") return <JpgToPngTool />;
  if (slug === "png-to-jpg") return <PngToJpgTool />;
  if (slug === "background-remover") return <BackgroundRemoverTool />;
  if (slug === "crop-image") return <CropImageTool />;
  if (slug === "resize-image") return <ResizeImageTool />;
  if (slug === "jpg-to-pdf") return <JpgToPdfTool />;
  if (slug === "png-to-pdf") return <JpgToPdfTool pngOnly />;
  if (slug === "pdf-to-jpg") return <PdfToJpgTool />;
  if (slug === "merge-pdf") return <MergePdfTool />;
  if (slug === "compress-pdf") return <CompressPdfTool />;
  if (slug === "split-pdf") return <SplitPdfTool />;
  if (slug === "rotate-pdf") return <RotatePdfTool />;
  if (slug === "protect-pdf") return <ProtectPdfTool />;
  if (slug === "unlock-pdf") return <UnlockPdfTool />;
  if (slug === "watermark-pdf") return <WatermarkPdfTool />;
  if (slug === "delete-pdf-pages") return <DeletePdfPagesTool />;
  if (slug === "organize-pdf-pages") return <OrganizePdfPagesTool />;
  if (slug === "crop-pdf") return <CropPdfTool />;
  if (slug === "pdf-to-word") return <PdfToWordTool />;
  if (slug === "word-to-pdf") return <WordToPdfTool />;
  if (slug === "excel-to-pdf") return <ExcelToPdfTool />;
  if (slug === "pdf-to-excel") return <PdfToExcelTool />;
  if (slug === "powerpoint-to-pdf") return <PowerPointToPdfTool />;
  if (slug === "pdf-to-powerpoint") return <PdfToPowerPointTool />;
  if (slug === "signature-resize-tool") return <SignatureResizeTool />;
  if (slug === "passport-photo-maker") return <PassportPhotoMakerTool />;
  if (slug === "ssc-photo-resize") return <SscPhotoSignatureHelperTool />;
  if (slug === "rrb-signature-resize") return <RrbPhotoSignatureHelperTool />;
  if (slug === "ibps-photo-resize") return <IbpsPhotoSignatureHelperTool />;
  if (slug === "ojas-photo-resize") return <OjasPhotoSignatureTool />;
  if (slug === "gpsc-photo-resize") return <GpscPhotoSignatureTool />;
  if (slug === "upsc-photo-resize") return <UpscPhotoSignatureTool />;
  if (slug === "front-back-card-merge") return <FrontBackCardMergeTool />;

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <UploadBox title={`Upload for ${name}`} description={description} restoreTransferredFiles />
    </div>
  );
  };

  return (
    <div key={`${slug}-${resetVersion}`} className="contents" data-clarity-mask="true" onClick={onToolClick}>
      {renderTool()}
    </div>
  );
}
