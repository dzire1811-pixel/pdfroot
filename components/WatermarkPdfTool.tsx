"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileImage, FileText, RefreshCcw, Stamp, UploadCloud } from "lucide-react";

type WatermarkType = "text" | "image";
type WatermarkPosition = "center" | "top" | "bottom" | "left" | "right";

type WatermarkResult = {
  url: string;
  sizeKb: number;
  previewUrl: string | null;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isWatermarkImage(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "image/png" || file.type === "image/jpeg" || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function textPosition(position: WatermarkPosition, pageWidth: number, pageHeight: number, textWidth: number, fontSize: number) {
  const margin = 42;
  if (position === "top") return { x: (pageWidth - textWidth) / 2, y: pageHeight - margin - fontSize };
  if (position === "bottom") return { x: (pageWidth - textWidth) / 2, y: margin };
  if (position === "left") return { x: margin, y: (pageHeight - fontSize) / 2 };
  if (position === "right") return { x: pageWidth - textWidth - margin, y: (pageHeight - fontSize) / 2 };
  return { x: (pageWidth - textWidth) / 2, y: (pageHeight - fontSize) / 2 };
}

function imagePosition(position: WatermarkPosition, pageWidth: number, pageHeight: number, width: number, height: number) {
  const margin = 42;
  if (position === "top") return { x: (pageWidth - width) / 2, y: pageHeight - height - margin };
  if (position === "bottom") return { x: (pageWidth - width) / 2, y: margin };
  if (position === "left") return { x: margin, y: (pageHeight - height) / 2 };
  if (position === "right") return { x: pageWidth - width - margin, y: (pageHeight - height) / 2 };
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
}

export function WatermarkPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>("text");
  const [text, setText] = useState("PDFRoot");
  const [fontSize, setFontSize] = useState(52);
  const [textOpacity, setTextOpacity] = useState(0.22);
  const [angle, setAngle] = useState(-35);
  const [position, setPosition] = useState<WatermarkPosition>("center");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0.22);
  const [imageSize, setImageSize] = useState(35);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF and choose watermark settings.");
  const [result, setResult] = useState<WatermarkResult | null>(null);

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFile(null);
    setImageFile(null);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setProgress(0);
    setStatus("Upload a PDF and choose watermark settings.");
  }

  function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();
    setProgress(0);

    if (!nextFile) return;
    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a PDF and choose watermark settings.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setStatus("PDF loaded. Choose watermark settings and add watermark.");
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function onImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    setError(null);
    clearResult();

    if (!nextFile) return;
    if (!isWatermarkImage(nextFile)) {
      setImageFile(null);
      setError(`"${nextFile.name}" is not a supported image. Please upload JPG or PNG.`);
      event.target.value = "";
      return;
    }

    setImageFile(nextFile);
    setStatus("Watermark image selected.");
    event.target.value = "";
  }

  function validateForm() {
    if (!file) return "Please upload a PDF first.";
    if (watermarkType === "text" && !text.trim()) return "Please enter watermark text.";
    if (watermarkType === "image" && !imageFile) return "Please upload a watermark image.";
    return null;
  }

  async function renderFirstPagePreview(pdfBytes: Uint8Array) {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice().buffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.45 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return null;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      return blob ? URL.createObjectURL(blob) : null;
    } catch {
      return null;
    }
  }

  async function addWatermark() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!file) return;

    setError(null);
    clearResult();
    setIsProcessing(true);
    setProgress(20);
    setStatus("Reading PDF file...");

    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      setProgress(45);
      setStatus("Applying watermark...");

      if (watermarkType === "text") {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const finalFontSize = clampNumber(fontSize, 10, 160);
        const finalOpacity = clampNumber(textOpacity, 0.05, 1);
        const finalAngle = clampNumber(angle, -180, 180);

        pages.forEach((page) => {
          const { width, height } = page.getSize();
          const textWidth = font.widthOfTextAtSize(text.trim(), finalFontSize);
          const { x, y } = textPosition(position, width, height, textWidth, finalFontSize);
          page.drawText(text.trim(), {
            x,
            y,
            size: finalFontSize,
            font,
            color: rgb(1, 0.18, 0.18),
            opacity: finalOpacity,
            rotate: degrees(finalAngle),
          });
        });
      } else if (imageFile) {
        const imageBytes = await imageFile.arrayBuffer();
        const lowerName = imageFile.name.toLowerCase();
        const watermarkImage = lowerName.endsWith(".png") || imageFile.type === "image/png" ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
        const finalOpacity = clampNumber(imageOpacity, 0.05, 1);
        const finalSize = clampNumber(imageSize, 8, 90) / 100;

        pages.forEach((page) => {
          const { width, height } = page.getSize();
          const maxWidth = width * finalSize;
          const scale = maxWidth / watermarkImage.width;
          const drawWidth = watermarkImage.width * scale;
          const drawHeight = watermarkImage.height * scale;
          const { x, y } = imagePosition(position, width, height, drawWidth, drawHeight);
          page.drawImage(watermarkImage, {
            x,
            y,
            width: drawWidth,
            height: drawHeight,
            opacity: finalOpacity,
          });
        });
      }

      setProgress(78);
      setStatus("Preparing watermarked PDF...");
      const watermarkedBytes = await pdfDoc.save();
      const outputBytes = new Uint8Array(watermarkedBytes);
      const blob = new Blob([outputBytes as BlobPart], { type: "application/pdf" });
      const previewUrl = await renderFirstPagePreview(outputBytes);
      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        previewUrl,
      });
      setProgress(100);
      setStatus("Watermarked PDF is ready to download.");
    } catch (err) {
      setProgress(0);
      setStatus("Watermark failed.");
      setError(err instanceof Error ? err.message : "Could not add watermark to this PDF. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="watermark-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="watermark-pdf-upload"
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
            <input id="watermark-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <Stamp className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, add a text or image watermark, and download the final PDF.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDF
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Secure Files", "Fast Processing", "Instant Download"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>

          {result?.previewUrl && (
            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Preview</h3>
              <div className="mt-4 grid min-h-64 place-items-center rounded-2xl bg-white p-4">
                <img src={result.previewUrl} alt="Watermarked PDF first page preview" className="max-h-80 max-w-full rounded-xl border border-slate-200 object-contain shadow-sm" />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Watermark PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Add text or image watermark to every PDF page.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["text", "Text watermark", FileText],
              ["image", "Image watermark", FileImage],
            ].map(([value, label, TypeIcon]) => {
              const Icon = TypeIcon as typeof FileText;
              return (
                <button
                  key={value as string}
                  type="button"
                  onClick={() => {
                    setWatermarkType(value as WatermarkType);
                    clearResult();
                    setError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black transition ${
                    watermarkType === value ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-800 hover:border-red-200 hover:text-[#FF2D2D]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label as string}
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-4">
            {watermarkType === "text" ? (
              <>
                <div>
                  <label htmlFor="watermark-text" className="text-sm font-black text-slate-950">
                    Watermark Text
                  </label>
                  <input
                    id="watermark-text"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      clearResult();
                    }}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                    placeholder="Enter watermark text"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm font-black text-slate-950">
                    Font size
                    <input type="number" min={10} max={160} value={fontSize} onChange={(event) => { setFontSize(Number(event.target.value)); clearResult(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label className="text-sm font-black text-slate-950">
                    Opacity
                    <input type="number" min={0.05} max={1} step={0.05} value={textOpacity} onChange={(event) => { setTextOpacity(Number(event.target.value)); clearResult(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label className="text-sm font-black text-slate-950">
                    Angle
                    <input type="number" min={-180} max={180} value={angle} onChange={(event) => { setAngle(Number(event.target.value)); clearResult(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="watermark-image" className="text-sm font-black text-slate-950">
                    Watermark Image
                  </label>
                  <input id="watermark-image" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onImageInputChange} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#FF2D2D] file:px-4 file:py-2 file:text-sm file:font-black file:text-white" />
                  <p className="mt-2 truncate text-sm font-semibold text-slate-500">{imageFile ? imageFile.name : "No watermark image selected"}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-black text-slate-950">
                    Opacity
                    <input type="number" min={0.05} max={1} step={0.05} value={imageOpacity} onChange={(event) => { setImageOpacity(Number(event.target.value)); clearResult(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                  <label className="text-sm font-black text-slate-950">
                    Size %
                    <input type="number" min={8} max={90} value={imageSize} onChange={(event) => { setImageSize(Number(event.target.value)); clearResult(); }} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
                  </label>
                </div>
              </>
            )}

            <div>
              <label htmlFor="watermark-position" className="text-sm font-black text-slate-950">
                Position
              </label>
              <select
                id="watermark-position"
                value={position}
                onChange={(event) => {
                  setPosition(event.target.value as WatermarkPosition);
                  clearResult();
                }}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void addWatermark()}
              disabled={!file || isProcessing}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isProcessing ? "Processing..." : "Add Watermark"}
              <Stamp className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={resetTool} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Clear
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "watermarked")}-watermarked.pdf`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download Watermarked PDF ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
