"use client";

import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, GripVertical, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import JSZip from "jszip";

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  pages: number;
  sheetCount: number;
  fileCount: number;
  isZip: boolean;
};

type SheetData = {
  name: string;
  rows: string[][];
};

type WorkflowStep = "arrange" | "convert" | "download";
type PageSize = "a4" | "letter";
type Orientation = "landscape" | "portrait";
type MarginSize = "small" | "normal" | "large";
type ColumnFit = "readable" | "all";
type SheetScope = "all" | "first";

const EXCEL_ACCEPT = ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel";
}

function cleanFileName(name: string) {
  return name.replace(/\.xlsx?$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function trimSheetRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function ExcelToPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload an Excel file to convert into PDF.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [marginSize, setMarginSize] = useState<MarginSize>("normal");
  const [columnFit, setColumnFit] = useState<ColumnFit>("readable");
  const [sheetScope, setSheetScope] = useState<SheetScope>("all");
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<PdfResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "Excel file" : "Excel files"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("excel-to-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFiles([]);
    setError(null);
    setProgress(0);
    setStatus("Upload an Excel file to convert into PDF.");
    setIsProcessing(false);
    setWorkflowStep("arrange");
    setDraggedIndex(null);
    setIsSettingsDrawerOpen(false);
  }

  function removeFile(indexToRemove: number) {
    clearResult();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus(files.length <= 1 ? "Upload an Excel file to convert into PDF." : "Excel file removed. Convert when ready.");
  }

  function selectFiles(nextFiles: File[]) {
    setError(null);
    clearResult();
    setProgress(0);

    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isExcelFile(nextFile))) {
      setError("Please upload a valid XLS or XLSX Excel file.");
      return;
    }

    setFiles((current) => [...current, ...nextFiles]);
    setWorkflowStep("arrange");
    setStatus("Excel file loaded. Convert when ready.");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  }

  async function convertToPdf() {
    if (files.length === 0) {
      setError("Please upload an Excel file first.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setIsSettingsDrawerOpen(false);
    setWorkflowStep("convert");
    setProgress(0);
    scrollToolStageIntoView();

    try {
      const [{ read, utils }, { jsPDF }] = await Promise.all([import("xlsx"), import("jspdf")]);
      const convertedFiles: Array<{ fileName: string; blob: Blob; pages: number; sheetCount: number }> = [];
      let totalPages = 0;
      let totalSheets = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Reading ${currentFile.name}...`);
        const workbook = read(await currentFile.arrayBuffer(), { type: "array", cellDates: true });
        const selectedSheetNames = sheetScope === "first" ? workbook.SheetNames.slice(0, 1) : workbook.SheetNames;
        const sheets: SheetData[] = selectedSheetNames.map((name) => ({
          name,
          rows: trimSheetRows(utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]),
        })).filter((sheet) => sheet.rows.length > 0);

        if (!sheets.length) {
          throw new Error(`${currentFile.name} has no readable table data.`);
        }

        const pdf = new jsPDF({ unit: "pt", format: pageSize, orientation });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = marginSize === "small" ? 22 : marginSize === "large" ? 54 : 36;
        const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;
        const rowHeight = 22;

        function addTitle(sheetName: string, rowCount: number) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(18);
          pdf.setTextColor(15, 23, 42);
          pdf.text(sheetName, margin, margin);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(100, 116, 139);
          pdf.text(`${rowCount} row${rowCount === 1 ? "" : "s"}`, margin, margin + 18);
        }

        function addSheet(sheet: SheetData, sheetIndex: number) {
          if (sheetIndex > 0) {
            pdf.addPage(pageSize, orientation);
          }

          addTitle(sheet.name, sheet.rows.length);
          const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
          const visibleColumns = columnFit === "all" ? columnCount : Math.min(columnCount, 10);
          const columnWidth = maxWidth / visibleColumns;
          let y = margin + 48;

          pdf.setFontSize(8);
          pdf.setDrawColor(226, 232, 240);

          sheet.rows.forEach((row, rowIndex) => {
            if (y + rowHeight > margin + maxHeight) {
              pdf.addPage(pageSize, orientation);
              addTitle(`${sheet.name} continued`, sheet.rows.length);
              y = margin + 48;
            }

            const isHeader = rowIndex === 0;
            if (isHeader) {
              pdf.setFillColor(248, 250, 252);
            }

            for (let colIndex = 0; colIndex < visibleColumns; colIndex += 1) {
              const x = margin + colIndex * columnWidth;
              const value = row[colIndex] ?? "";
              pdf.setDrawColor(226, 232, 240);
              pdf.rect(x, y - 13, columnWidth, rowHeight, isHeader ? "FD" : "S");
              pdf.setFont("helvetica", isHeader ? "bold" : "normal");
              pdf.setTextColor(15, 23, 42);
              const text = pdf.splitTextToSize(value, columnWidth - 8) as string[];
              pdf.text(text.slice(0, 2), x + 4, y);
            }

            y += rowHeight;
          });

          if (columnCount > visibleColumns) {
            y += 10;
            pdf.setFont("helvetica", "italic");
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.text(`Showing first ${visibleColumns} columns for readable PDF layout.`, margin, Math.min(y, pageHeight - margin));
          }
        }

        sheets.forEach((sheet, index) => {
          setStatus(`Converting ${currentFile.name} sheet ${index + 1} of ${sheets.length}: ${sheet.name}`);
          addSheet(sheet, index);
          setProgress(Math.round(((fileIndex + (index + 1) / sheets.length) / files.length) * 85));
        });

        setStatus(`Creating PDF file for ${currentFile.name}...`);
        const blob = pdf.output("blob");
        const pages = pdf.getNumberOfPages();
        convertedFiles.push({ fileName: `${cleanFileName(currentFile.name)}.pdf`, blob, pages, sheetCount: sheets.length });
        totalPages += pages;
        totalSheets += sheets.length;
      }

      setStatus("Preparing PDF download...");
      let blob: Blob;

      if (convertedFiles.length === 1) {
        blob = convertedFiles[0].blob;
      } else {
        const zip = new JSZip();
        convertedFiles.forEach((item) => zip.file(item.fileName, item.blob));
        blob = await zip.generateAsync({ type: "blob" });
      }

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pages: totalPages,
        sheetCount: totalSheets,
        fileCount: convertedFiles.length,
        isZip: convertedFiles.length > 1,
      });
      setProgress(100);
      setStatus("Basic PDF file generated. Complex layouts may not be fully preserved.");
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this Excel file to PDF. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    } finally {
      setIsProcessing(false);
    }
  }

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
      if (drawerCloseTimerRef.current) clearTimeout(drawerCloseTimerRef.current);
    };
  }, []);

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
    if (!isSettingsDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const onResize = () => { if (innerWidth >= 640) setIsSettingsDrawerOpen(false); };
    addEventListener("keydown", onKeyDown);
    addEventListener("resize", onResize);
    return () => { removeEventListener("keydown", onKeyDown); removeEventListener("resize", onResize); };
  }, [closeSettingsDrawer, isSettingsDrawerOpen]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "arrange") {
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
      const fallbackBarHeight = window.innerWidth < 640 ? 120 : 96;
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
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    clearResult();
    setFiles((current) => {
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex >= current.length || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [draggedFile] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedFile);
      setDraggedIndex(targetIndex);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("Order updated. Convert when ready.");
  }

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor="excel-pdf-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="excel-pdf-upload" name="excel-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept={EXCEL_ACCEPT} multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FileSpreadsheet className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop Excel file</span>
        <span className="sr-only">Upload Excel files and convert readable sheets into PDF.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose Excel
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderExcelCard(excelFile: File, index: number) {
    return (
      <article
        draggable
        onDragStart={() => setDraggedIndex(index)}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => reorderByDragEnter(index)}
        onDrop={() => setDraggedIndex(null)}
        onDragEnd={() => setDraggedIndex(null)}
        className="group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:border-red-200 active:cursor-grabbing"
      >
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{index + 1}</span>
          <button type="button" onClick={(event) => { event.stopPropagation(); removeFile(index); }} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${excelFile.name}`}><Trash2 className="h-4 w-4" /></button>
          <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm"><GripVertical className="h-4 w-4" aria-hidden="true" /></span>
          <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
            <FileSpreadsheet className="h-16 w-16" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-snug text-slate-950" title={excelFile.name}>{excelFile.name}</p>
            <p className="mt-1.5 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(excelFile.size)} KB</p>
          </div>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your Excel file...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we create the PDF file.</p>
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
    const downloadName = result?.isZip ? "PDFRoot-pdf-files.zip" : `${cleanFileName(files[0]?.name || "PDFRoot")}.pdf`;

    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF file is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${result.sizeKb.toFixed(1)} KB - ${result.pages} pages` : "Ready"}
          </p>
          {result && (
            <a href={result.url} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              {result.isZip ? "Download ZIP" : "Download PDF"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Convert another Excel file
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderSettings(desktop = false) {
    const groups = [
      { label: "Page size", value: pageSize, set: (v: string) => setPageSize(v as PageSize), options: [["a4", "A4"], ["letter", "Letter"]] },
      { label: "Orientation", value: orientation, set: (v: string) => setOrientation(v as Orientation), options: [["landscape", "Landscape"], ["portrait", "Portrait"]] },
      { label: "Margins", value: marginSize, set: (v: string) => setMarginSize(v as MarginSize), options: [["small", "Small"], ["normal", "Normal"], ["large", "Large"]] },
      { label: "Columns", value: columnFit, set: (v: string) => setColumnFit(v as ColumnFit), options: [["readable", "Readable"], ["all", "Fit all"]] },
      { label: "Sheets", value: sheetScope, set: (v: string) => setSheetScope(v as SheetScope), options: [["all", "All"], ["first", "First"]] },
    ];
    if (desktop) return <div className="flex min-w-max flex-nowrap items-end gap-2 pb-1">{groups.map((group) => <label key={group.label} className="w-[6rem] shrink-0"><span className="mb-1 block text-[0.62rem] font-black uppercase tracking-wide text-slate-500">{group.label}</span><select value={group.value} onChange={(event) => group.set(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 outline-none focus:border-[#FF2D2D]">{group.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div>;
    return <div className="grid gap-3">{groups.map((group) => <fieldset key={group.label}><legend className="mb-1 text-[0.68rem] font-black uppercase tracking-wide text-slate-500">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.options.map(([value, label]) => <button key={value} type="button" onClick={() => group.set(value)} className={`h-9 rounded-lg border px-2.5 text-xs font-black ${group.value === value ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-200 bg-white text-slate-700"}`}>{label}</button>)}</div></fieldset>)}</div>;
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className={`relative min-w-0 bg-slate-100 p-4 text-left sm:p-6 ${workflowStep === "download" ? "min-h-0" : "min-h-[calc(100dvh-9rem)]"}`}>
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
              {files.map((excelFile, index) => (
                <div key={`${excelFile.name}-${excelFile.size}-${excelFile.lastModified}-${index}`}>{renderExcelCard(excelFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:self-center"><p className="truncate text-sm font-black text-slate-950">{readyLabel}</p><button type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black sm:hidden"><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button></div>
          <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain sm:block">{renderSettings(true)}</div>
          <div className="min-w-0 sm:ml-auto">
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <label htmlFor="excel-pdf-workspace-upload" aria-label="Add Excel files" className="relative inline-grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </label>
              <button type="button" onClick={() => void convertToPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Converting..." : "Convert to PDF"}
                <FileText className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
                Clear all
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;
    return <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes excelDrawerIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} onClick={closeSettingsDrawer} aria-label="Close settings" /><div role="dialog" aria-modal="true" aria-label="Excel to PDF settings" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[min(72vh,36rem)] flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[excelDrawerIn_220ms_ease-out]"}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center" onPointerDown={onDrawerPointerDown} onPointerMove={onDrawerPointerMove} onPointerUp={finishDrawerDrag} onPointerCancel={finishDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black">PDF settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderSettings()}</div></div></div>;
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="excel-to-pdf-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input id="excel-pdf-workspace-upload" name="excel-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept={EXCEL_ACCEPT} multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "arrange" && isActionBarVisible && renderBottomActionBar()}
          {workflowStep === "arrange" && renderMobileSettingsDrawer()}
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
