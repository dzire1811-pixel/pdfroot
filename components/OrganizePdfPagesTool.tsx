"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, Image as ImageIcon, RefreshCcw, RotateCcw, RotateCw, Rows3, Trash2, UploadCloud } from "lucide-react";
import { loadPdfJs } from "@/lib/pdfjsClient";

type PageItem = {
  id: number;
  pageNumber: number;
  rotation: number;
  url: string | null;
};

type OrganizeResult = {
  url: string;
  sizeKb: number;
  pageCount: number;
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

function moveItem(items: PageItem[], fromId: number, toId: number) {
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

export function OrganizePdfPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageItems, setPageItems] = useState<PageItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [draggedPageId, setDraggedPageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to organize pages.");
  const [result, setResult] = useState<OrganizeResult | null>(null);

  function clearPageItems() {
    pageItems.forEach((page) => {
      if (page.url) URL.revokeObjectURL(page.url);
    });
    setPageItems([]);
  }

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  async function renderPageItems(nextFile: File, totalPages: number) {
    const pdfjsLib = await loadPdfJs();

    const bytes = await nextFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    const previewLimit = Math.min(totalPages, 60);
    const items: PageItem[] = Array.from({ length: totalPages }, (_, index) => ({
      id: index + 1,
      pageNumber: index + 1,
      rotation: 0,
      url: null,
    }));

    for (let pageNumber = 1; pageNumber <= previewLimit; pageNumber += 1) {
      setStatus(`Creating page preview ${pageNumber} of ${previewLimit}...`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.28 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Your browser does not support PDF preview rendering.");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((previewBlob) => {
          if (previewBlob) {
            resolve(previewBlob);
            return;
          }
          reject(new Error("Could not create page preview."));
        }, "image/jpeg", 0.75);
      });

      items[pageNumber - 1] = {
        ...items[pageNumber - 1],
        url: URL.createObjectURL(blob),
      };
      setPageItems([...items]);
      setProgress(Math.round((pageNumber / previewLimit) * 70));
    }

    return previewLimit;
  }

  async function loadPdf(nextFile: File) {
    clearPageItems();
    clearResult();
    setSelectedPages([]);
    setDraggedPageId(null);
    setError(null);
    setProgress(0);

    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a PDF file to organize pages.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setIsProcessing(true);
    setStatus("Reading PDF pages...");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(await nextFile.arrayBuffer(), { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();
      const renderedCount = await renderPageItems(nextFile, totalPages);
      setProgress(100);
      setStatus(
        totalPages > renderedCount
          ? `PDF loaded with ${totalPages} pages. Showing first ${renderedCount} thumbnails; all pages can still be organized.`
          : `PDF loaded with ${totalPages} page${totalPages === 1 ? "" : "s"}. Drag pages to reorder.`,
      );
    } catch (err) {
      setFile(null);
      setProgress(0);
      setStatus("PDF load failed.");
      setError(err instanceof Error ? err.message : "Could not read this PDF. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) void loadPdf(nextFile);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void loadPdf(nextFile);
  }

  function togglePage(pageId: number) {
    clearResult();
    setError(null);
    setSelectedPages((current) =>
      current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId].sort((a, b) => a - b),
    );
  }

  function selectAllPages() {
    clearResult();
    setError(null);
    setSelectedPages(pageItems.map((page) => page.id));
    setStatus("All pages selected.");
  }

  function clearSelection() {
    clearResult();
    setError(null);
    setSelectedPages([]);
    setStatus("Selection cleared.");
  }

  function resetOrder() {
    clearResult();
    setError(null);
    setSelectedPages([]);
    setPageItems((current) => current.map((item) => ({ ...item, rotation: 0 })).sort((a, b) => a.pageNumber - b.pageNumber));
    setStatus("Pages reset to original order.");
  }

  function reverseOrder() {
    clearResult();
    setError(null);
    setPageItems((current) => [...current].reverse());
    setStatus("Pages sorted in reverse order.");
  }

  function rotatePage(pageId: number, direction: -90 | 90) {
    clearResult();
    setError(null);
    setPageItems((current) => current.map((page) => (page.id === pageId ? { ...page, rotation: (page.rotation + direction + 360) % 360 } : page)));
  }

  function deleteSelectedPages() {
    clearResult();
    setError(null);

    if (!selectedPages.length) {
      setError("Please select at least one page to delete.");
      return;
    }

    if (selectedPages.length >= pageItems.length) {
      setError("You cannot delete all pages. At least one page must remain.");
      return;
    }

    setPageItems((current) => current.filter((page) => !selectedPages.includes(page.id)));
    setStatus(`Deleted ${selectedPages.length} selected page${selectedPages.length === 1 ? "" : "s"} from the working layout.`);
    setSelectedPages([]);
  }

  function onPageDragStart(pageId: number) {
    setDraggedPageId(pageId);
  }

  function onPageDrop(targetPageId: number) {
    if (!draggedPageId) return;
    clearResult();
    setError(null);
    setPageItems((current) => moveItem(current, draggedPageId, targetPageId));
    setDraggedPageId(null);
    setStatus("Page order updated.");
  }

  async function downloadOrganizedPdf() {
    if (!file || !pageItems.length) {
      setError("Please upload a PDF first.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(25);
    setStatus("Organizing PDF pages...");

    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const sourcePdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const outputPdf = await PDFDocument.create();
      const copiedPages = await outputPdf.copyPages(sourcePdf, pageItems.map((page) => page.pageNumber - 1));

      setProgress(65);
      copiedPages.forEach((copiedPage, index) => {
        const pageConfig = pageItems[index];
        const currentAngle = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentAngle + pageConfig.rotation + 360) % 360));
        outputPdf.addPage(copiedPage);
      });

      setProgress(90);
      const organizedBytes = await outputPdf.save();
      const blob = new Blob([organizedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pageCount: pageItems.length,
      });
      setProgress(100);
      setStatus("Organized PDF is ready to download.");
    } catch (err) {
      setProgress(0);
      setStatus("Organize PDF failed.");
      setError(err instanceof Error ? err.message : "Could not organize this PDF. Please try another file.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="organize-pdf-pages-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="organize-pdf-pages-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingUpload(true);
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={onDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDraggingUpload ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="organize-pdf-pages-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <Rows3 className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, reorder pages, rotate pages, remove pages, and download the organized PDF.</span>
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
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Organize PDF Pages</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Drag, rotate, delete, reverse, and download a clean PDF.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {file ? `${pageItems.length} page${pageItems.length === 1 ? "" : "s"} in layout - ${formatKb(file.size)} KB` : "No file selected"}
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={resetOrder} disabled={!pageItems.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Reset Order
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={reverseOrder} disabled={!pageItems.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Reverse Order
            </button>
            <button type="button" onClick={selectAllPages} disabled={!pageItems.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Select All
            </button>
            <button type="button" onClick={clearSelection} disabled={!selectedPages.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-50">
              Clear Selection
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">{selectedPages.length} page{selectedPages.length === 1 ? "" : "s"} selected</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {selectedPages.length ? selectedPages.join(", ") : "Tap thumbnails to select pages for deletion."}
            </p>
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3">
            <button type="button" onClick={deleteSelectedPages} disabled={!selectedPages.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-6 py-4 text-sm font-black text-[#FF2D2D] transition hover:border-[#FF2D2D] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
              Delete Selected Pages
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void downloadOrganizedPdf()} disabled={!file || !pageItems.length || isProcessing} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70">
              {isProcessing ? "Processing..." : "Download Organized PDF"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "organized")}-organized.pdf`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Save Organized PDF ({result.sizeKb.toFixed(1)} KB, {result.pageCount} pages)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {pageItems.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
              <h3 className="text-lg font-black text-slate-950">Page Thumbnails</h3>
            </div>
            <p className="text-sm font-semibold text-slate-500">Drag cards to reorder. Use arrows to rotate.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {pageItems.map((page) => {
              const selected = selectedPages.includes(page.id);
              return (
                <article
                  key={page.id}
                  draggable
                  onDragStart={() => onPageDragStart(page.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onPageDrop(page.id)}
                  className={`rounded-2xl border p-2 transition hover:-translate-y-0.5 ${
                    selected ? "border-[#FF2D2D] bg-red-50 ring-4 ring-red-100" : "border-slate-200 bg-white hover:border-red-200"
                  }`}
                >
                  <button type="button" onClick={() => togglePage(page.id)} className="block w-full text-left">
                    <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-xl bg-slate-100">
                      {page.url ? (
                        <img src={page.url} alt={`Page ${page.pageNumber} preview`} className="h-full w-full object-contain transition" style={{ transform: `rotate(${page.rotation}deg)` }} />
                      ) : (
                        <span className="text-center text-xs font-black text-slate-500">Page {page.pageNumber}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-700">Page {page.pageNumber}</p>
                      {selected && <span className="rounded-full bg-[#FF2D2D] px-2 py-1 text-[10px] font-black text-white">Selected</span>}
                    </div>
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => rotatePage(page.id, -90)} className="grid h-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Rotate page ${page.pageNumber} left`}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => rotatePage(page.id, 90)} className="grid h-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]" aria-label={`Rotate page ${page.pageNumber} right`}>
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
