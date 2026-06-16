"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileText, ImageUp, Trash2, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  dataUrl: string;
};

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function fileToImage(file: File) {
  return new Promise<ImageItem>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Your browser does not support image processing."));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0);

      resolve({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        url: objectUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read ${file.name}. Please upload JPG, JPEG, or PNG images.`));
    };

    image.src = objectUrl;
  });
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

function buildPdf(items: ImageItem[]) {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [0];
  let position = 0;
  let objectId = 1;
  const pageObjectIds: number[] = [];
  const pageData = items.map((item) => {
    const ratio = item.width / item.height;
    const pageWidth = ratio >= 1 ? 842 : 595;
    const pageHeight = ratio >= 1 ? 595 : 842;
    const margin = 28;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = item.width / item.height;
    let drawWidth = maxWidth;
    let drawHeight = drawWidth / imageRatio;

    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight * imageRatio;
    }

    return {
      ...item,
      pageWidth,
      pageHeight,
      drawWidth,
      drawHeight,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      imageObjectId: objectId++,
      contentObjectId: objectId++,
      pageObjectId: objectId++,
    };
  });
  const pagesObjectId = objectId++;
  const catalogObjectId = objectId++;

  function write(value: string | Uint8Array) {
    const chunk = typeof value === "string" ? encoder.encode(value) : value;
    parts.push(chunk as BlobPart);
    position += chunk.length;
  }

  function beginObject(id: number) {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
  }

  write("%PDF-1.4\n%PDFRoot\n");

  for (const item of pageData) {
    const imageBytes = dataUrlToBytes(item.dataUrl);
    beginObject(item.imageObjectId);
    write(`<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    write(imageBytes);
    write("\nendstream\nendobj\n");

    const content = `q\n${item.drawWidth.toFixed(2)} 0 0 ${item.drawHeight.toFixed(2)} ${item.x.toFixed(2)} ${item.y.toFixed(2)} cm\n/Im${item.imageObjectId} Do\nQ\n`;
    beginObject(item.contentObjectId);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    pageObjectIds.push(item.pageObjectId);
    beginObject(item.pageObjectId);
    write(
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${item.pageWidth} ${item.pageHeight}] /Resources << /XObject << /Im${item.imageObjectId} ${item.imageObjectId} 0 R >> >> /Contents ${item.contentObjectId} 0 R >>\nendobj\n`,
    );
  }

  beginObject(pagesObjectId);
  write(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`);

  beginObject(catalogObjectId);
  write(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>\nendobj\n`);

  const xrefOffset = position;
  write(`xref\n0 ${catalogObjectId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= catalogObjectId; id += 1) {
    write(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${catalogObjectId + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

export function JpgToPdfTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<PdfResult | null>(null);

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    clearResult();
    const nextFiles = Array.from(files);
    const invalid = nextFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name));

    if (invalid) {
      setError(`"${invalid.name}" is not supported. Please upload JPG, JPEG, PNG, or WEBP images only.`);
      return;
    }

    if (items.length + nextFiles.length > 40) {
      setError("Please upload up to 40 images at a time.");
      return;
    }

    try {
      const loaded = await Promise.all(nextFiles.map(fileToImage));
      setItems((current) => [...current, ...loaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load one of the images.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      void addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) {
      void addFiles(event.dataTransfer.files);
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length > 0) {
        void addFiles(files);
      }
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveItem(index: number, direction: -1 | 1) {
    clearResult();
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(id: string) {
    clearResult();
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function clearAll() {
    clearResult();
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setError(null);
  }

  async function convertToPdf() {
    if (!items.length) {
      setError("Please upload at least one image first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    clearResult();

    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const blob = buildPdf(items);
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the PDF. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="jpg-to-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="jpg-pdf-upload"
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
            <input id="jpg-pdf-upload" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <ImageUp className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Images</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one or multiple JPG, JPEG, or PNG images. Reorder them before creating your PDF.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Images
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
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">JPG to PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Images are converted locally in your browser. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected images</p>
            <p className="mt-2 text-sm font-black text-slate-950">{items.length} image{items.length === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Total upload size: {formatKb(totalSize)} KB</p>
          </div>

          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void convertToPdf()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Creating PDF..." : "Create PDF"}
              <FileText className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              Clear All
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">PDF ready: {result.sizeKb.toFixed(1)} KB</p>
              <a
                href={result.url}
                download="PDFRoot-images.pdf"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download PDF
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">Image Preview & Order</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Use the arrows to arrange the PDF page order.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="grid aspect-[4/3] place-items-center bg-slate-100">
                  <img src={item.url} alt={`Preview ${index + 1}`} className="h-full w-full object-contain" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{index + 1}. {item.file.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item.width} x {item.height}px - {formatKb(item.file.size)} KB
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`Move ${item.file.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                      className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={`Move ${item.file.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
