"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Eye, EyeOff, FileText, GripVertical, Loader2, Plus, RotateCcw, Trash2, UnlockKeyhole, UploadCloud } from "lucide-react";
import JSZip from "jszip";

type WorkflowStep = "settings" | "process" | "download";

const CARD_DRAG_TYPE = "application/x-pdfroot-unlock-card";

type UnlockResult = {
  url: string;
  sizeKb: number;
  fileCount: number;
  downloadName: string;
  downloadLabel: string;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function looksEncrypted(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 250000)));
  return text.includes("/Encrypt");
}

function friendlyUnlockError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/password|invalid|decrypt|encryption|readFile|No such file/i.test(message)) {
    return "Could not unlock this PDF. Please check the password and try again.";
  }

  return "Could not unlock this PDF. Please try another file.";
}

export function UnlockPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [sourcePreviewUrls, setSourcePreviewUrls] = useState<string[]>([]);
  const [encryptedFlags, setEncryptedFlags] = useState<boolean[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a protected PDF to unlock it.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("settings");
  const [result, setResult] = useState<UnlockResult | null>(null);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<UnlockResult | null>(null);
  const sourcePreviewUrlsRef = useRef<string[]>([]);
  const draggedIndexRef = useRef<number | null>(null);
  const fileCount = files.length;
  const encryptedCount = encryptedFlags.filter(Boolean).length;
  const needsPassword = encryptedCount > 0;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("unlock-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    setResult(null);
    resultRef.current = null;
  }

  function clearSourcePreviews() {
    sourcePreviewUrlsRef.current.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    sourcePreviewUrlsRef.current = [];
    setSourcePreviewUrls([]);
  }

  function setActiveDraggedIndex(index: number | null) {
    draggedIndexRef.current = index;
    setDraggedIndex(index);
  }

  function resetTool() {
    clearResult();
    clearSourcePreviews();
    setFiles([]);
    setEncryptedFlags([]);
    setPassword("");
    setShowPassword(false);
    setError(null);
    setIsDragging(false);
    setActiveDraggedIndex(null);
    setProgress(0);
    setWorkflowStep("settings");
    setStatus("Upload a protected PDF to unlock it.");
  }

  function removeFile(indexToRemove: number) {
    setError(null);
    clearResult();
    setProgress(0);
    setWorkflowStep("settings");
    setActiveDraggedIndex(null);
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setEncryptedFlags((current) => current.filter((_, index) => index !== indexToRemove));
    setSourcePreviewUrls((current) => {
      const next = [...current];
      const [removedUrl] = next.splice(indexToRemove, 1);
      if (removedUrl) URL.revokeObjectURL(removedUrl);
      sourcePreviewUrlsRef.current = next;
      return next;
    });
    setStatus("PDF list updated. Enter a password if required and unlock PDF.");
  }

  async function handleFiles(nextFiles: FileList | File[] | null | undefined) {
    const incomingFiles = Array.from(nextFiles ?? []);
    setError(null);
    clearResult();
    setProgress(0);

    if (incomingFiles.length === 0) return;
    const invalidFile = incomingFiles.find((nextFile) => !isPdf(nextFile));
    if (invalidFile) {
      setStatus(files.length > 0 ? "PDF list is ready. Enter a password if required and unlock PDF." : "Upload a protected PDF to unlock it.");
      setError(`"${invalidFile.name}" is not a PDF file. Please upload PDF files only.`);
      return;
    }

    setStatus("Checking PDF security...");

    try {
      const incomingEncryptedFlags = await Promise.all(
        incomingFiles.map(async (nextFile) => {
          const bytes = new Uint8Array(await nextFile.arrayBuffer());
          return looksEncrypted(bytes);
        })
      );
      const previewUrls = incomingFiles.map((nextFile) => URL.createObjectURL(nextFile));

      setFiles((current) => [...current, ...incomingFiles]);
      setEncryptedFlags((current) => [...current, ...incomingEncryptedFlags]);
      setSourcePreviewUrls((current) => {
        const next = [...current, ...previewUrls];
        sourcePreviewUrlsRef.current = next;
        return next;
      });
      setWorkflowStep("settings");
      setStatus(incomingEncryptedFlags.some(Boolean) ? "Password-protected PDF detected. Enter the password to unlock it." : "This PDF does not appear to need a password. You can create an unlocked copy.");
      scrollToolStageIntoView();
    } catch {
      setError("Could not read this PDF file. Please try another PDF.");
      setStatus("PDF check failed.");
      setProgress(0);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
    event.target.value = "";
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function hasDraggedCard(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes(CARD_DRAG_TYPE);
  }

  function onFileDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function onFileDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  function validateForm() {
    if (files.length === 0) return "Please upload at least one PDF first.";
    if (needsPassword && !password.trim()) return "Password is required to unlock this PDF.";
    return null;
  }

  async function unlockPdf() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (files.length === 0) return;

    setError(null);
    clearResult();
    setWorkflowStep("process");
    setProgress(30);
    setStatus("Loading PDF unlock engine...");

    try {
      const { default: initQpdf } = await import("qpdf-wasm");
      const qpdf = await initQpdf({
        locateFile: (path) => {
          if (path.endsWith(".wasm")) return "/qpdf.wasm";
          if (path.endsWith(".js")) return "/qpdf.js";
          return path;
        },
        print: () => undefined,
        printErr: () => undefined,
      });
      const outputFiles: Array<{ name: string; bytes: Uint8Array }> = [];

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        const inputPath = `/locked-${fileIndex}.pdf`;
        const outputPath = `/unlocked-${fileIndex}.pdf`;

        setStatus(`Unlocking ${currentFile.name} (${fileIndex + 1} of ${files.length})...`);
        qpdf.FS.writeFile(inputPath, new Uint8Array(await currentFile.arrayBuffer()));

        const passwordArgs = encryptedFlags[fileIndex] ? [`--password=${password}`] : [];
        qpdf.callMain([...passwordArgs, "--decrypt", inputPath, outputPath]);
        const unlockedBytes = qpdf.FS.readFile(outputPath);
        outputFiles.push({
          name: `${cleanFileName(currentFile.name)}-unlocked.pdf`,
          bytes: new Uint8Array(unlockedBytes),
        });

        try {
          qpdf.FS.unlink(inputPath);
          qpdf.FS.unlink(outputPath);
        } catch {
          // Files are temporary in the in-browser engine.
        }

        setProgress(Math.min(90, 30 + Math.round(((fileIndex + 1) / files.length) * 60)));
      }

      setProgress(92);
      setStatus(files.length === 1 ? "Preparing unlocked PDF..." : "Preparing unlocked PDF ZIP...");
      const blob =
        outputFiles.length === 1
          ? new Blob([outputFiles[0].bytes as BlobPart], { type: "application/pdf" })
          : await (async () => {
              const zip = new JSZip();
              outputFiles.forEach((outputFile) => zip.file(outputFile.name, outputFile.bytes));
              return zip.generateAsync({ type: "blob" });
            })();

      setResult({
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        fileCount: outputFiles.length,
        downloadName: outputFiles.length === 1 ? outputFiles[0].name : "PDFRoot-unlocked-pdfs.zip",
        downloadLabel: outputFiles.length === 1 ? "Download PDF" : "Download ZIP",
      });
      setProgress(100);
      setStatus(files.length === 1 ? "Unlocked PDF is ready to download." : "Unlocked PDFs are ready to download.");
      setWorkflowStep("download");
    } catch (err) {
      setProgress(0);
      setStatus("PDF unlock failed.");
      setWorkflowStep("settings");
      setError(friendlyUnlockError(err));
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    sourcePreviewUrlsRef.current = sourcePreviewUrls;
  }, [sourcePreviewUrls]);

  useEffect(() => {
    return () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      sourcePreviewUrlsRef.current.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => {
    if (workflowStep === "process" || workflowStep === "download") {
      scrollToolStageIntoView();
    }
  }, [workflowStep]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "settings") {
      setIsActionBarVisible(false);
      return;
    }

    let frame = 0;

    const updateActionBarVisibility = () => {
      const workspace = workspaceRef.current;
      const workArea = workAreaRef.current;

      if (!workspace || !workArea) {
        setIsActionBarVisible(false);
        return;
      }

      const viewportHeight = window.innerHeight;
      const workAreaRect = workArea.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const fallbackBarHeight = window.innerWidth < 640 ? 220 : 140;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const workspaceStillCoversBar = workspaceRect.bottom > viewportHeight - barHeight - 8;

      setIsActionBarVisible(workAreaInView && workspaceStillCoversBar);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActionBarVisibility);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [files.length, workflowStep]);

  function reorderByDragEnter(targetIndex: number) {
    const fromIndex = draggedIndexRef.current;
    if (fromIndex === null || fromIndex === targetIndex) return;

    setError(null);
    clearResult();
    setFiles((current) => {
      if (fromIndex < 0 || targetIndex < 0 || fromIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedFile] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedFile);
      setActiveDraggedIndex(targetIndex);
      return next;
    });
    setEncryptedFlags((current) => {
      if (fromIndex < 0 || targetIndex < 0 || fromIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedFlag] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedFlag);
      return next;
    });
    setSourcePreviewUrls((current) => {
      if (fromIndex < 0 || targetIndex < 0 || fromIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedUrl] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedUrl);
      sourcePreviewUrlsRef.current = next;
      return next;
    });
    setProgress(0);
    setWorkflowStep("settings");
    setStatus("Order updated. Enter a password if required and unlock PDF.");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="unlock-pdf-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="unlock-pdf-upload" name="unlock-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <UnlockKeyhole className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload PDF files, enter the password if required, and download unlocked PDFs.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(disabled = false) {
    return (
      <label
        htmlFor="unlock-pdf-workspace-upload"
        aria-label="Change PDF"
        title="Change PDF"
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${
          disabled ? "pointer-events-none cursor-not-allowed opacity-60 hover:translate-y-0" : "cursor-pointer"
        }`}
      >
        <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
          {fileCount}
        </span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </label>
    );
  }

  function renderFileCard(pdfFile: File, index: number) {
    const sourcePreviewUrl = sourcePreviewUrls[index];
    const isCardDragging = draggedIndex !== null;

    function startCardDrag(event: DragEvent<HTMLElement>) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-no-card-drag='true']")) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(CARD_DRAG_TYPE, String(index));
      setActiveDraggedIndex(index);
    }

    function onCardDragOver(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event)) return;
      if (!hasDraggedCard(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }

    function onCardDragEnter(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event) || !hasDraggedCard(event)) return;
      event.preventDefault();
      reorderByDragEnter(index);
    }

    function onCardDrop(event: DragEvent<HTMLElement>) {
      if (hasDraggedFiles(event)) return;
      if (!hasDraggedCard(event)) return;
      event.preventDefault();
      setActiveDraggedIndex(null);
    }

    return (
      <article
        draggable
        onDragStart={startCardDrag}
        onDragEnd={() => setActiveDraggedIndex(null)}
        onDragOver={onCardDragOver}
        onDragEnter={onCardDragEnter}
        onDrop={onCardDrop}
        className={`group relative flex h-full w-full max-w-sm min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
          draggedIndex === index ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
        }`}
      >
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
            {index + 1}
          </span>
          {encryptedFlags[index] && (
            <span className="absolute bottom-2 left-2 z-10 rounded-full bg-slate-950 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide text-white">
              Password
            </span>
          )}
          <button
            type="button"
            draggable
            onDragStart={startCardDrag}
            onDragEnd={() => setActiveDraggedIndex(null)}
            className="absolute right-2 top-2 z-30 grid h-8 w-8 cursor-grab place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm transition hover:text-[#FF2D2D] active:cursor-grabbing"
            aria-label={`Drag ${pdfFile.name} to reorder`}
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          {sourcePreviewUrl ? (
            <object data={`${sourcePreviewUrl}#toolbar=0&navpanes=0`} type="application/pdf" className="h-full w-full touch-pan-y overflow-auto bg-white">
              <div className="grid h-full w-full place-items-center bg-slate-50 p-6 text-center">
                <div>
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                    <FileText className="h-10 w-10" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-400">PDF</p>
                  <p className="mt-2 text-xs font-bold text-slate-500">Preview unavailable</p>
                </div>
              </div>
            </object>
          ) : (
            <div className="grid h-full w-full place-items-center bg-slate-50 p-6 text-center">
              <div>
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                  <FileText className="h-10 w-10" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-black uppercase tracking-[0.16em] text-slate-400">PDF</p>
                <p className="mt-2 text-xs font-bold text-slate-500">Preview loading</p>
              </div>
            </div>
          )}
          <div
            className={`absolute inset-y-0 left-0 right-3 z-20 cursor-grab ${isCardDragging ? "" : "active:cursor-grabbing"}`}
            draggable
            onDragStart={startCardDrag}
            onDragOver={onCardDragOver}
            onDragEnter={onCardDragEnter}
            onDrop={onCardDrop}
            onDragEnd={() => setActiveDraggedIndex(null)}
            aria-hidden="true"
          />
        </div>
        <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{pdfFile.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(pdfFile.size)} KB</p>
          </div>
          <button
            type="button"
            draggable={false}
            data-no-card-drag="true"
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              removeFile(index);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
            aria-label={`Remove ${pdfFile.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </article>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Unlocking PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your PDF.</p>
          <p className="mt-2 truncate text-xs font-bold text-slate-400">{status}</p>
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
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${formatResultSize(result.sizeKb)}` : "Ready"}
          </p>
          {result && (
            <a
              href={result.url}
              download={result.downloadName}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
            >
              {result.downloadLabel}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={resetTool}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
          >
            Process another file
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "settings" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
              {files.map((pdfFile, index) => (
                <div key={sourcePreviewUrls[index] ?? `${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}-${index}`}>{renderFileCard(pdfFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "process" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderPasswordSettings() {
    const compactInputClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-950 shadow-sm outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100";

    return (
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(10rem,14rem)_auto] xl:flex xl:flex-none xl:items-center">
        <input
          id="unlock-pdf-password"
          name="unlock-pdf-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
            clearResult();
          }}
          aria-label="PDF password"
          placeholder={needsPassword ? "PDF password" : "Password if required"}
          className={`${compactInputClass} min-w-0 xl:w-56`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className={`${compactInputClass} inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 text-slate-800 hover:border-red-200 hover:text-[#FF2D2D] xl:w-36`}
        >
          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    );
  }

  function renderBottomActionBar() {
    const isProcessing = workflowStep === "process";

    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            {renderPasswordSettings()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(9rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              {renderAddMoreButton(isProcessing)}
              <button
                type="button"
                onClick={() => void unlockPdf()}
                disabled={isProcessing}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base"
              >
                {isProcessing ? "Processing..." : "Unlock PDF"}
                <UnlockKeyhole className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetTool}
                disabled={isProcessing}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm"
              >
                Clear All
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="unlock-pdf-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <input id="unlock-pdf-workspace-upload" name="unlock-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "settings" && isActionBarVisible && renderBottomActionBar()}
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
