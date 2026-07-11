"use client";

import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, FileType2, GripVertical, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  pages: number;
  messages: string[];
};

type TextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

type WorkflowStep = "arrange" | "convert" | "download";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function cleanFileName(name: string) {
  return name.replace(/\.(docx?|DOCX?)$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function isWordFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword"
  );
}

function collectTextSegments(node: Node, inherited: Omit<TextSegment, "text"> = { bold: false, italic: false }): TextSegment[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return [{ text: node.textContent ?? "", ...inherited }];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const next = {
    bold: inherited.bold || tag === "strong" || tag === "b",
    italic: inherited.italic || tag === "em" || tag === "i",
  };

  return Array.from(element.childNodes).flatMap((child) => collectTextSegments(child, next));
}

function normalizeSegments(segments: TextSegment[]) {
  return segments
    .map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, " ") }))
    .filter((segment) => segment.text.trim().length > 0);
}

export function WordToPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a DOCX file to convert into PDF.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setStatus("Upload a DOCX file to convert into PDF.");
    setWorkflowStep("arrange");
    setIsSettingsDrawerOpen(false);
  }

  function selectFile(nextFile: File) {
    if (!isWordFile(nextFile)) {
      setError("Please upload a DOC or DOCX Word file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setError(null);
    setProgress(0);
    setStatus("Word file selected. Click Convert to PDF.");
    setWorkflowStep("arrange");
    requestAnimationFrame(() => document.getElementById("word-to-pdf-tool")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
      setError("Please upload a DOCX file first.");
      return;
    }

    if (file.name.toLowerCase().endsWith(".doc")) {
      setError("Legacy .doc files cannot be converted fully in this browser tool. Please save the file as .docx and upload again.");
      return;
    }

    clearResult();
    setError(null);
    setProgress(0);
    setWorkflowStep("convert");
    setIsSettingsDrawerOpen(false);

    try {
      setStatus("Reading Word document...");
      const [{ default: mammoth }, { jsPDF }] = await Promise.all([import("mammoth"), import("jspdf")]);
      const arrayBuffer = await file.arrayBuffer();
      const converted = await mammoth.convertToHtml({ arrayBuffer });
      setProgress(35);

      const parser = new DOMParser();
      const html = parser.parseFromString(converted.value || "<p>No readable text found.</p>", "text/html");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 54;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      function addPageIfNeeded(extra = 24) {
        if (y + extra > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      }

      function setFont(segment: Omit<TextSegment, "text">, size: number) {
        const style = segment.bold && segment.italic ? "bolditalic" : segment.bold ? "bold" : segment.italic ? "italic" : "normal";
        pdf.setFont("helvetica", style);
        pdf.setFontSize(size);
      }

      function writeSegments(segments: TextSegment[], size = 11, lineHeight = 18) {
        const words = normalizeSegments(segments).flatMap((segment) =>
          segment.text.split(" ").filter(Boolean).map((word) => ({ ...segment, text: word })),
        );
        let x = margin;

        for (const word of words) {
          setFont(word, size);
          const wordText = `${word.text} `;
          const width = pdf.getTextWidth(wordText);

          if (x + width > margin + maxWidth) {
            y += lineHeight;
            x = margin;
            addPageIfNeeded(lineHeight);
          }

          pdf.text(wordText, x, y);
          x += width;
        }

        y += lineHeight + 4;
        addPageIfNeeded(lineHeight);
      }

      function writeText(text: string, size = 11, bold = false, lineHeight = 18) {
        const lines = pdf.splitTextToSize(text, maxWidth) as string[];
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);

        for (const line of lines) {
          addPageIfNeeded(lineHeight);
          pdf.text(line, margin, y);
          y += lineHeight;
        }
        y += 4;
      }

      function writeTable(table: HTMLTableElement) {
        const rows = Array.from(table.querySelectorAll("tr"));
        const columns = Math.max(1, ...rows.map((row) => row.querySelectorAll("th,td").length));
        const cellWidth = maxWidth / columns;
        const rowHeight = 28;
        pdf.setFontSize(9);

        rows.forEach((row) => {
          addPageIfNeeded(rowHeight + 8);
          const cells = Array.from(row.querySelectorAll("th,td"));
          cells.forEach((cell, index) => {
            const x = margin + index * cellWidth;
            const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
            pdf.setDrawColor(226, 232, 240);
            pdf.rect(x, y - 14, cellWidth, rowHeight);
            pdf.setFont("helvetica", cell.tagName.toLowerCase() === "th" ? "bold" : "normal");
            pdf.text(pdf.splitTextToSize(text, cellWidth - 10) as string[], x + 5, y);
          });
          y += rowHeight;
        });
        y += 12;
      }

      setStatus("Building PDF...");
      const bodyChildren = Array.from(html.body.children);
      const nodes = bodyChildren.length ? bodyChildren : Array.from(html.body.childNodes);

      nodes.forEach((node, index) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }

        const element = node as HTMLElement;
        const tag = element.tagName.toLowerCase();
        setProgress(35 + Math.round(((index + 1) / Math.max(1, nodes.length)) * 55));

        if (tag === "table") {
          writeTable(element as HTMLTableElement);
          return;
        }

        if (tag === "h1") {
          writeText(element.textContent?.trim() || "", 20, true, 28);
          return;
        }

        if (tag === "h2") {
          writeText(element.textContent?.trim() || "", 16, true, 23);
          return;
        }

        if (tag === "h3") {
          writeText(element.textContent?.trim() || "", 13, true, 20);
          return;
        }

        if (tag === "ul" || tag === "ol") {
          Array.from(element.querySelectorAll("li")).forEach((li, liIndex) => {
            const prefix = tag === "ol" ? `${liIndex + 1}. ` : "- ";
            writeSegments([{ text: prefix, bold: false, italic: false }, ...collectTextSegments(li)], 11, 18);
          });
          return;
        }

        const segments = collectTextSegments(element);
        if (segments.some((segment) => segment.text.trim())) {
          writeSegments(segments, 11, 18);
        }
      });

      const blob = pdf.output("blob");
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pages: pdf.getNumberOfPages(),
        messages: converted.messages.map((message) => message.message),
      });
      setProgress(100);
      setStatus("PDF generated successfully. Basic formatting has been preserved where possible.");
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this Word file to PDF. Please try another DOCX file.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    }
  }

  function openSettingsDrawer() {
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    setSettingsDrawerDragOffset(0);
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerOpen(true);
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing) return;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(360);
    drawerCloseTimerRef.current = setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setSettingsDrawerDragOffset(0);
      drawerCloseTimerRef.current = null;
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  function onDrawerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    drawerDragStartYRef.current = event.clientY - settingsDrawerDragOffset;
    setIsSettingsDrawerDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (drawerDragStartYRef.current !== null) setSettingsDrawerDragOffset(Math.max(0, event.clientY - drawerDragStartYRef.current));
  }

  function finishDrawerDrag() {
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    if (settingsDrawerDragOffset >= 84) closeSettingsDrawer();
    else setSettingsDrawerDragOffset(0);
  }

  useEffect(() => {
    if (!file || workflowStep !== "arrange") return setIsActionBarVisible(false);
    let frame = 0;
    const update = () => {
      const workspace = workspaceRef.current;
      const workArea = workAreaRef.current;
      if (!workspace || !workArea) return setIsActionBarVisible(false);
      const barHeight = actionBarRef.current?.offsetHeight ?? (window.innerWidth < 640 ? 120 : 96);
      const area = workArea.getBoundingClientRect();
      setIsActionBarVisible(area.bottom > 0 && area.top < innerHeight && workspace.getBoundingClientRect().bottom > innerHeight - barHeight - 8);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); };
  }, [file, workflowStep]);

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [closeSettingsDrawer, isSettingsDrawerOpen]);

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
  }, [result?.url]);

  const accept = ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return (
    <section id="word-to-pdf-tool" data-v0-managed-flow="true" data-merge-pdf-workspace={file ? "true" : undefined} className={`mx-auto mt-6 max-w-full scroll-mt-32 text-left ${file ? "w-full overflow-visible border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"}`}>
      {!file ? (
        <>
          <label data-primary-upload="true" htmlFor="word-pdf-upload" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"}`}>
            <input id="word-pdf-upload" ref={inputRef} className="sr-only" type="file" accept={accept} onChange={onInputChange} />
            <FileType2 className="h-16 w-16 stroke-[1.35] text-white transition group-hover:scale-105" aria-hidden="true" />
            <span className="sr-only">Drag and drop a Word document</span>
            <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 transition group-hover:-translate-y-0.5">Choose Word File<UploadCloud className="h-5 w-5" /></span>
          </label>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        </>
      ) : (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100 transition">
          <input ref={addInputRef} className="sr-only" type="file" accept={accept} onChange={onInputChange} />
          <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className={`relative min-w-0 bg-slate-100 p-4 text-left sm:p-6 ${workflowStep === "download" ? "min-h-0" : "min-h-[calc(100dvh-9rem)]"}`}>
            {workflowStep === "arrange" && <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28"><article className="group relative flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:border-red-200 hover:shadow-md"><div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white">1</span><button type="button" onClick={resetTool} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${file.name}`}><Trash2 className="h-4 w-4" /></button><span className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm"><GripVertical className="h-4 w-4" /></span><div className="grid h-full w-full place-items-center rounded-lg bg-white text-[#FF2D2D]"><FileText className="h-16 w-16" /></div></div><div className="mt-2 min-w-0"><p className="truncate text-sm font-black leading-snug text-slate-950" title={file.name}>{file.name}</p><p className="mt-1.5 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(file.size)} KB</p></div></article></div>}
            {workflowStep === "convert" && <div className="grid justify-items-center px-2 py-2 sm:px-4 sm:py-3"><div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]"><Loader2 className="h-8 w-8 animate-spin" /></div><h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your Word document...</h3><p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your PDF.</p><p className="mt-2 truncate text-xs font-bold text-slate-400">{status}</p><div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm font-black text-slate-700">{progress}%</p></div></div>}
            {workflowStep === "download" && <div className="grid justify-items-center px-2 py-2 sm:px-4 sm:py-3"><div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></div><h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3><p className="mt-2 text-sm font-semibold text-slate-500">{result ? `${result.pages} ${result.pages === 1 ? "page" : "pages"} - ${result.sizeKb.toFixed(1)} KB` : "Ready"}</p>{result && <a href={result.url} download={`${cleanFileName(file.name)}.pdf`} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">Download PDF<Download className="h-5 w-5" /></a>}<button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">Convert another Word file<RotateCcw className="h-5 w-5" /></button></div></div>}
          </div>
          {workflowStep === "arrange" && isActionBarVisible && <div ref={actionBarRef} className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,.08)] backdrop-blur sm:px-6"><div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-950">1 file ready</p><button type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black sm:hidden"><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button></div><div className="hidden text-xs font-bold text-slate-500 sm:block">DOCX preserves headings, text styling and simple tables where possible.</div><div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:min-w-[30rem]"><button type="button" onClick={() => addInputRef.current?.click()} aria-label="Add Word file" className="relative inline-grid h-12 w-12 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,.3)] sm:h-14 sm:w-14"><span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[.7rem] font-black text-white ring-2 ring-white">1</span><Plus className="h-7 w-7 stroke-[3]" /></button><button type="button" onClick={() => void convertToPdf()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,.24)] hover:bg-red-600 sm:min-h-14 sm:text-base">Convert to PDF<FileType2 className="h-5 w-5" /></button><button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 hover:text-[#FF2D2D] sm:min-h-14 sm:text-sm">Clear all<RotateCcw className="h-5 w-5" /></button></div>{error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}</div></div>}
          {workflowStep === "arrange" && isSettingsDrawerOpen && <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes wordDrawerIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} onClick={closeSettingsDrawer} aria-label="Close settings" /><div role="dialog" aria-modal="true" aria-label="Word to PDF settings" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[72vh] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[wordDrawerIn_220ms_ease-out]"}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" onPointerDown={onDrawerPointerDown} onPointerMove={onDrawerPointerMove} onPointerUp={finishDrawerDrag} onPointerCancel={finishDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black">Conversion settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button></div><div className="px-4 py-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Document support</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-700">DOCX preserves headings, paragraphs, bold and italic text, and simple tables where possible. Legacy DOC files should be saved as DOCX first.</p></div></div></div>}
        </div>
      )}
    </section>
  );
}
