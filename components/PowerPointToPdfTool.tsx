"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, PanelTop, RotateCcw, UploadCloud } from "lucide-react";
import JSZip from "jszip";

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  slideCount: number;
};

type SlideText = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bold: boolean;
  italic: boolean;
};

type SlideShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
};

type SlideImage = {
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
  format: "PNG" | "JPEG";
};

type SlideData = {
  title: string;
  texts: SlideText[];
  shapes: SlideShape[];
  images: SlideImage[];
};

const EMU_PER_POINT = 12700;

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPowerPointFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".pptx") ||
    name.endsWith(".ppt") ||
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.type === "application/vnd.ms-powerpoint"
  );
}

function cleanFileName(name: string) {
  return name.replace(/\.(pptx?|PPTX?)$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function textContent(element: Element, selector: string) {
  return element.querySelector(selector)?.textContent ?? "";
}

function attrNumber(element: Element | null, name: string, fallback = 0) {
  const value = element?.getAttribute(name);
  return value ? Number(value) || fallback : fallback;
}

function emuToPt(value: number, scale: number) {
  return (value / EMU_PER_POINT) * scale;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function escapeXmlName(name: string) {
  return name.replace(/^\//, "");
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read slide image."));
    reader.readAsDataURL(blob);
  });
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function slideSortKey(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

async function parseSlide(zip: JSZip, slidePath: string, pageScale: number): Promise<SlideData> {
  const xml = await zip.file(slidePath)?.async("string");
  if (!xml) {
    throw new Error(`Could not read ${slidePath}.`);
  }

  const doc = parseXml(xml);
  const relPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const relXml = await zip.file(relPath)?.async("string");
  const relDoc = relXml ? parseXml(relXml) : null;
  const rels = new Map<string, string>();

  relDoc?.querySelectorAll("Relationship").forEach((rel) => {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) {
      rels.set(id, target);
    }
  });

  const shapes: SlideShape[] = [];
  const texts: SlideText[] = [];
  const images: SlideImage[] = [];

  doc.querySelectorAll("p\\:sp, sp").forEach((shape) => {
    const off = shape.querySelector("a\\:off, off");
    const ext = shape.querySelector("a\\:ext, ext");
    const x = emuToPt(attrNumber(off, "x"), pageScale);
    const y = emuToPt(attrNumber(off, "y"), pageScale);
    const w = emuToPt(attrNumber(ext, "cx", 914400), pageScale);
    const h = emuToPt(attrNumber(ext, "cy", 457200), pageScale);
    const fillColor = shape.querySelector("a\\:solidFill a\\:srgbClr, solidFill srgbClr")?.getAttribute("val") ?? undefined;
    const paragraphs = Array.from(shape.querySelectorAll("a\\:p, p"));
    const textLines = paragraphs
      .map((paragraph) =>
        Array.from(paragraph.querySelectorAll("a\\:r, r")).map((run) => textContent(run, "a\\:t, t")).join(""),
      )
      .filter((line) => line.trim().length > 0);

    if (fillColor && !textLines.length) {
      shapes.push({ x, y, w, h, fill: fillColor });
    }

    if (textLines.length) {
      const runs = Array.from(shape.querySelectorAll("a\\:r, r"));
      const firstRunProps = runs[0]?.querySelector("a\\:rPr, rPr");
      texts.push({
        text: textLines.join("\n"),
        x,
        y,
        w,
        h,
        bold: firstRunProps?.getAttribute("b") === "1",
        italic: firstRunProps?.getAttribute("i") === "1",
      });
    }
  });

  for (const picture of Array.from(doc.querySelectorAll("p\\:pic, pic"))) {
    const off = picture.querySelector("a\\:off, off");
    const ext = picture.querySelector("a\\:ext, ext");
    const embedId = picture.querySelector("a\\:blip, blip")?.getAttribute("r:embed");
    const target = embedId ? rels.get(embedId) : null;

    if (!target) {
      continue;
    }

    const imagePath = escapeXmlName(target.startsWith("../") ? `ppt/${target.replace("../", "")}` : `ppt/slides/${target}`);
    const imageFile = zip.file(imagePath);
    if (!imageFile) {
      continue;
    }

    const lower = imagePath.toLowerCase();
    if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) {
      continue;
    }

    const blob = await imageFile.async("blob");
    images.push({
      x: emuToPt(attrNumber(off, "x"), pageScale),
      y: emuToPt(attrNumber(off, "y"), pageScale),
      w: emuToPt(attrNumber(ext, "cx", 914400), pageScale),
      h: emuToPt(attrNumber(ext, "cy", 457200), pageScale),
      dataUrl: await blobToDataUrl(blob),
      format: lower.endsWith(".png") ? "PNG" : "JPEG",
    });
  }

  return {
    title: texts[0]?.text.split("\n")[0] || slidePath.split("/").pop() || "Slide",
    texts,
    shapes,
    images,
  };
}

export function PowerPointToPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PPTX file to convert slides into PDF.");

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
    setStatus("Upload a PPTX file to convert slides into PDF.");
    setIsProcessing(false);
  }

  function selectFile(nextFile: File) {
    if (!isPowerPointFile(nextFile)) {
      setError("Please upload a valid PPT or PPTX PowerPoint file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setError(null);
    setProgress(0);
    setStatus("PowerPoint file selected. Click Convert to PDF.");
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

  async function convertToPdf() {
    if (!file) {
      setError("Please upload a PPTX file first.");
      return;
    }

    if (file.name.toLowerCase().endsWith(".ppt")) {
      setError("Legacy .ppt files cannot be converted fully in this browser tool. Please save the file as .pptx and upload again.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      setStatus("Reading PowerPoint slides...");
      const { jsPDF } = await import("jspdf");
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const slidePaths = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort((a, b) => slideSortKey(a) - slideSortKey(b));

      if (!slidePaths.length) {
        throw new Error("No slides found in this PowerPoint file.");
      }

      const firstSlideXml = await zip.file(slidePaths[0])?.async("string");
      if (!firstSlideXml) {
        throw new Error("Could not read the first slide.");
      }

      const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
      const presentationDoc = presentationXml ? parseXml(presentationXml) : null;
      const sldSz = presentationDoc?.querySelector("p\\:sldSz, sldSz");
      const slideWidthPt = (attrNumber(sldSz ?? null, "cx", 12192000) / EMU_PER_POINT);
      const slideHeightPt = (attrNumber(sldSz ?? null, "cy", 6858000) / EMU_PER_POINT);
      const pdf = new jsPDF({
        unit: "pt",
        format: [slideWidthPt, slideHeightPt],
        orientation: slideWidthPt >= slideHeightPt ? "landscape" : "portrait",
      });
      const pageScale = 1;

      for (let index = 0; index < slidePaths.length; index += 1) {
        if (index > 0) {
          pdf.addPage([slideWidthPt, slideHeightPt], slideWidthPt >= slideHeightPt ? "landscape" : "portrait");
        }

        setStatus(`Converting slide ${index + 1} of ${slidePaths.length}...`);
        const slide = await parseSlide(zip, slidePaths[index], pageScale);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, slideWidthPt, slideHeightPt, "F");

        slide.shapes.forEach((shape) => {
          if (shape.fill) {
            const color = hexToRgb(shape.fill);
            pdf.setFillColor(color.r, color.g, color.b);
            pdf.rect(shape.x, shape.y, shape.w, shape.h, "F");
          }
        });

        slide.images.forEach((image) => {
          try {
            pdf.addImage(image.dataUrl, image.format, image.x, image.y, image.w, image.h);
          } catch {
            // Some PowerPoint image formats may not be supported by jsPDF.
          }
        });

        slide.texts.forEach((textBox, textIndex) => {
          const isTitle = textIndex === 0 || textBox.h > 300000 / EMU_PER_POINT;
          const fontSize = isTitle ? 24 : 13;
          const style = textBox.bold && textBox.italic ? "bolditalic" : textBox.bold ? "bold" : textBox.italic ? "italic" : "normal";
          pdf.setFont("helvetica", style);
          pdf.setFontSize(fontSize);
          pdf.setTextColor(15, 23, 42);
          const lines = pdf.splitTextToSize(textBox.text, Math.max(40, textBox.w)) as string[];
          pdf.text(lines, textBox.x, textBox.y + fontSize, { maxWidth: Math.max(40, textBox.w) });
        });

        setProgress(Math.round(((index + 1) / slidePaths.length) * 95));
      }

      const blob = pdf.output("blob");
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        slideCount: slidePaths.length,
      });
      setProgress(100);
      setStatus("PowerPoint converted to PDF. Slide layout is preserved as much as possible.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PowerPoint file to PDF. Please try another PPTX file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="powerpoint-to-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="powerpoint-pdf-upload"
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
            <input
              id="powerpoint-pdf-upload"
              className="sr-only"
              type="file"
              accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={onInputChange}
            />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <PanelTop className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PPTX</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload PowerPoint slides and convert them into a PDF document in your browser.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PowerPoint
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["PPTX Slides", "Layout Aware", "No Login"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">PPT to PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert PPTX slides into PDF with basic layout preservation. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No PowerPoint uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
            PPTX works best in-browser. Legacy .ppt files may need to be saved as .pptx first.
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
              onClick={() => void convertToPdf()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Converting..." : "Convert to PDF"}
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
              <p className="text-sm font-black text-slate-950">PDF ready: {result.sizeKb.toFixed(1)} KB</p>
              <p className="mt-1 text-sm font-bold text-slate-500">Converted {result.slideCount} slide{result.slideCount === 1 ? "" : "s"}.</p>
              <a
                href={result.url}
                download={`${cleanFileName(file?.name || "PDFRoot")}.pdf`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download PDF
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
