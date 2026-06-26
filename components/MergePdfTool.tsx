"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FilePlus2, FileText, GripVertical, Plus, RotateCcw, Trash2, UploadCloud } from "lucide-react";

type PdfItem = {
  id: string;
  file: File;
  previewUrl: string;
  thumbnailUrl: string | null;
};

type MergeResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
};

type WorkflowStep = "arrange" | "merge" | "download";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function createId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function renderFirstPageThumbnail(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 0.5 });
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
      reject(new Error("Could not create PDF preview."));
    }, "image/jpeg", 0.78);
  });

  return URL.createObjectURL(blob);
}

export function MergePdfTool() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload two or more PDF files to merge.");
  const [result, setResult] = useState<MergeResult | null>(null);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<PdfItem[]>([]);
  const resultRef = useRef<MergeResult | null>(null);

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function addFiles(files: FileList | File[]) {
    setError(null);
    clearResult();
    const nextFiles = Array.from(files);

    if (!nextFiles.length) {
      return;
    }

    const invalid = nextFiles.find((file) => !isPdf(file));
    if (invalid) {
      setError(`"${invalid.name}" is not a PDF file. Please upload PDF files only.`);
      return;
    }

    if (items.length + nextFiles.length > 30) {
      setError("Please upload up to 30 PDF files at a time.");
      return;
    }

    const newItems = nextFiles.map((file) => ({ id: createId(file), file, previewUrl: URL.createObjectURL(file), thumbnailUrl: null }));
    setItems((current) => [...current, ...newItems]);
    setWorkflowStep("arrange");
    setStatus("PDF files added. Arrange the order, then merge.");
    setProgress(0);

    newItems.forEach((item) => {
      void renderFirstPageThumbnail(item.file)
        .then((thumbnailUrl) => {
          setItems((current) =>
            current.map((currentItem) => {
              if (currentItem.id !== item.id) return currentItem;
              if (currentItem.thumbnailUrl) URL.revokeObjectURL(currentItem.thumbnailUrl);
              return { ...currentItem, thumbnailUrl };
            }),
          );
        })
        .catch(() => {
          setItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, thumbnailUrl: null } : currentItem)));
        });
    });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onAddMoreInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onUploadDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingUpload(false);
    if (event.dataTransfer.files.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  function removeItem(id: string) {
    clearResult();
    setItems((current) => {
      const itemToRemove = current.find((item) => item.id === id);
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
        if (itemToRemove.thumbnailUrl) URL.revokeObjectURL(itemToRemove.thumbnailUrl);
      }
      return current.filter((item) => item.id !== id);
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("PDF removed. Arrange the remaining files, then merge.");
  }

  function clearAll() {
    clearResult();
    items.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl);
      if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
    });
    setItems([]);
    setDraggedId(null);
    setError(null);
    setProgress(0);
    setStatus("Upload two or more PDF files to merge.");
    setWorkflowStep("arrange");
  }

  function reorderByDragEnter(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    clearResult();
    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return current;
      }

      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("Order updated. Merge when ready.");
  }

  function continueToMerge() {
    if (items.length < 2) {
      setError("Please upload at least two PDF files to merge.");
      return;
    }

    setWorkflowStep("merge");
    setStatus("Preparing your merged PDF...");
    setProgress(0);
    void mergePdfs();
  }

  async function mergePdfs() {
    if (items.length < 2) {
      setWorkflowStep("arrange");
      setError("Please upload at least two PDF files to merge.");
      return;
    }

    setError(null);
    setWorkflowStep("merge");
    setProgress(0);
    clearResult();

    try {
      const { PDFDocument } = await import("pdf-lib");
      const mergedPdf = await PDFDocument.create();

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setStatus(`Merging ${index + 1} of ${items.length}: ${item.file.name}`);
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        setProgress(Math.round(((index + 1) / items.length) * 90));
      }

      setStatus("Preparing merged PDF...");
      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as BlobPart], { type: "application/pdf" });
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
      setProgress(100);
      setStatus(`Merged ${items.length} PDF files successfully.`);
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge these PDF files. Please try another set.");
      setStatus("Merge failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    }
  }

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
      });
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url);
      }
    };
  }, []);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="merge-pdf-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingUpload(true);
        }}
        onDragLeave={() => setIsDraggingUpload(false)}
        onDrop={onUploadDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDraggingUpload ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="merge-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FilePlus2 className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDFs</span>
        <span className="sr-only">Upload multiple PDF files, reorder them, and merge into one PDF document.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDFs
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(className = "") {
    return (
      <button
        type="button"
        aria-label="Add more PDFs"
        onClick={() => addMoreInputRef.current?.click()}
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 ${className}`}
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {items.length}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderPdfPreview(item: PdfItem) {
    return (
      <div className="relative grid h-full w-full place-items-center overflow-hidden bg-white">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-contain p-3" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
            <FileText className="h-10 w-10" aria-hidden="true" />
            <span className="sr-only">PDF preview loading</span>
          </div>
        )}
      </div>
    );
  }

  function renderStepIndicator() {
    const steps: Array<{ id: WorkflowStep; label: string; number: number }> = [
      { id: "arrange", label: "Arrange", number: 1 },
      { id: "merge", label: "Merge", number: 2 },
      { id: "download", label: "Download", number: 3 },
    ];
    const activeIndex = steps.findIndex((step) => step.id === workflowStep);

    return (
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        {steps.map((step, index) => {
          const isActive = workflowStep === step.id;
          const isComplete = activeIndex > index;

          return (
            <div key={step.id} className="contents">
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${isActive ? "border-red-200 bg-red-50 text-[#FF2D2D]" : isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${isActive ? "bg-[#FF2D2D] text-white" : isComplete ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {isComplete ? "✓" : step.number}
                </span>
                <span className="text-sm font-black">{step.label}</span>
              </div>
              {index < steps.length - 1 && <div className={`hidden h-0.5 w-10 sm:block ${activeIndex > index ? "bg-emerald-500" : "bg-slate-200"}`} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid min-h-[24rem] place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition">
        <div className="w-full max-w-xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <FileText className="h-8 w-8" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Preparing your merged PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">{status}</p>
          <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">{progress}%</p>
        </div>
      </div>
    );
  }

  function renderSuccessCard() {
    return (
      <div className="grid min-h-[24rem] place-items-center rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm transition">
        <div className="w-full max-w-xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">File Size: {result ? formatResultSize(result.sizeKb) : "Ready"}</p>
          {result && (
            <a
              href={result.url}
              download="PDFRoot-merged.pdf"
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600"
            >
              Download PDF
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
          >
            Merge Another PDF
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderWorkspacePreview() {
    return (
      <div data-merge-preview-area="true" className="relative min-w-0 bg-slate-100 p-4 pb-28 text-left sm:p-6 sm:pb-28 lg:min-h-[calc(100vh-9rem)]">
        <input ref={addMoreInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onAddMoreInputChange} />
        <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Merge PDF</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {workflowStep === "arrange" ? "Drag cards to arrange PDF order." : workflowStep === "merge" ? "Arrange complete. Merging your PDFs now." : "Your merged PDF is ready to download."}
              </p>
            </div>
            <div className="inline-flex w-fit items-center rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#FF2D2D]">
              {items.length} {items.length === 1 ? "file" : "files"} selected
            </div>
          </div>
          <div className="mt-4">{renderStepIndicator()}</div>
        </div>

        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid grid-cols-2 items-start gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-8">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => reorderByDragEnter(item.id)}
                  onDrop={() => setDraggedId(null)}
                  onDragEnd={() => setDraggedId(null)}
                  className={`group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
                    draggedId === item.id ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
                  }`}
                >
                  <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
                      {index + 1}
                    </span>
                    <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="h-full w-full transition duration-200 group-hover:scale-[1.035]">{renderPdfPreview(item)}</div>
                  </div>
                  <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{item.file.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(item.file.size)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {workflowStep === "merge" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div data-merge-action-bar="true" className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-950">{items.length} {items.length === 1 ? "PDF" : "PDFs"} ready</p>
            <p className="text-xs font-semibold text-slate-500">Arrange files above, then continue.</p>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}

          <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[3.25rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
            {renderAddMoreButton("h-14 w-14")}
            <button
              type="button"
              onClick={continueToMerge}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-5 py-3 text-base font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              Merge PDF
              <FileText className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D]"
            >
              Clear
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <section data-v0-managed-flow="true" data-merge-pdf-workspace={items.length ? "true" : undefined} id="merge-pdf-tool" className={`mx-auto mt-6 max-w-full text-left ${items.length ? "w-screen border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"}`}>
      {items.length ? (
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          {renderWorkspacePreview()}
          {workflowStep === "arrange" && renderBottomActionBar()}
        </div>
      ) : (
        <>
          {renderUploadBox()}
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        </>
      )}
    </section>
  );
}
