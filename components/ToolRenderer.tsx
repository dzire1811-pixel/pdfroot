"use client";

import { UploadBox } from "@/components/UploadBox";
import { ResizeImageExactKbTool } from "@/components/ResizeImageExactKbTool";
import { CompressImageTool } from "@/components/CompressImageTool";
import { JpgToPngTool } from "@/components/JpgToPngTool";
import { PngToJpgTool } from "@/components/PngToJpgTool";
import { BackgroundRemoverTool } from "@/components/BackgroundRemoverTool";
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

export function ToolRenderer({ slug, name, description }: { slug: string; name: string; description: string }) {
  const renderTool = () => {
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
    <div className="contents" data-clarity-mask="true">
      {renderTool()}
    </div>
  );
}
