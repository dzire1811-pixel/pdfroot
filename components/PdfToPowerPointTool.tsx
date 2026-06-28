"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, PanelTop, RotateCcw, UploadCloud } from "lucide-react";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";

type PowerPointResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  slideCount: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function createImageSlidePptx(images: string[], title: string) {
  const zip = new JSZip();
  const slideWidth = 12192000;
  const slideHeight = 6858000;
  const presentationRelationships = images
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
    .join("");
  const slideIds = images
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
    .join("");
  const overrides = images
    .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${overrides}
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>PDFRoot</dc:creator>
  <cp:lastModifiedBy>PDFRoot</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);

  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>PDFRoot</Application>
  <Slides>${images.length}</Slides>
</Properties>`);

  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presentationRelationships}
</Relationships>`);

  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="${slideWidth}" cy="${slideHeight}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  images.forEach((dataUrl, index) => {
    const slideNumber = index + 1;
    zip.file(`ppt/media/image${slideNumber}.jpeg`, dataUrlToBytes(dataUrl));
    zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${slideNumber}.jpeg"/>
</Relationships>`);
    zip.file(`ppt/slides/slide${slideNumber}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="2" name="PDF Page ${slideNumber}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${slideWidth}" cy="${slideHeight}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);
  });

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

export function PdfToPowerPointTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PowerPointResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to convert into PowerPoint.");

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFile(null);
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to convert into PowerPoint.");
    setIsProcessing(false);
  }

  function selectFile(nextFile: File) {
    if (!isPdf(nextFile)) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setError(null);
    setProgress(0);
    setStatus("PDF selected. Click Convert to PowerPoint.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) {
      selectFile(nextFile);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) {
      selectFile(nextFile);
    }
  }

  async function convertToPowerPoint() {
    if (!file) {
      setError("Please upload a PDF file first.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      setStatus("Reading PDF pages...");
      const pdfjsLib = await loadPdfJs();

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const slideImages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Creating slide ${pageNumber} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxDimension = 1800;
        const scale = Math.min(2, Math.max(1.1, maxDimension / Math.max(baseViewport.width, baseViewport.height)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Your browser does not support PDF page rendering.");
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        slideImages.push(dataUrl);
        setProgress(Math.round((pageNumber / pdf.numPages) * 90));
      }

      setStatus("Preparing PowerPoint file...");
      const blob = await createImageSlidePptx(slideImages, `${file.name} converted to PowerPoint`);

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        slideCount: pdf.numPages,
      });
      setProgress(100);
      setStatus("PowerPoint generated. Complex PDF layouts are converted as slide images for best visual accuracy.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PDF to PowerPoint. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="pdf-to-powerpoint-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="pdf-powerpoint-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="pdf-powerpoint-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <PanelTop className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload a PDF and convert every page into a PowerPoint slide.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDF
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["PPTX Output", "Image Slides", "No Login"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">PDF to PowerPoint</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert PDF pages into PowerPoint slides. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
            PowerPoint generated. Complex PDF layouts are converted as slide images for best visual accuracy.
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
              <span>{status}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void convertToPowerPoint()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Converting..." : "Convert to PPTX"}
              <PanelTop className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetTool}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              Clear
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">PPTX ready: {result.sizeKb.toFixed(1)} KB</p>
              <p className="mt-1 text-sm font-bold text-slate-500">Created {result.slideCount} slide{result.slideCount === 1 ? "" : "s"}.</p>
              <a
                href={result.url}
                download={`${cleanFileName(file?.name || "PDFRoot")}.pptx`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download PPTX
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
