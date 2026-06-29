"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, GripVertical, Loader2, Plus, RotateCcw, Trash2, UploadCloud } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<PdfResult | null>(null);
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
        const sheets: SheetData[] = workbook.SheetNames.map((name) => ({
          name,
          rows: trimSheetRows(utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]),
        })).filter((sheet) => sheet.rows.length > 0);

        if (!sheets.length) {
          throw new Error(`${currentFile.name} has no readable table data.`);
        }

        const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 36;
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
            pdf.addPage("a4", "landscape");
          }

          addTitle(sheet.name, sheet.rows.length);
          const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
          const visibleColumns = Math.min(columnCount, 10);
          const columnWidth = maxWidth / visibleColumns;
          let y = margin + 48;

          pdf.setFontSize(8);
          pdf.setDrawColor(226, 232, 240);

          sheet.rows.forEach((row, rowIndex) => {
            if (y + rowHeight > margin + maxHeight) {
              pdf.addPage("a4", "landscape");
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
    };
  }, []);

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
        <input id="excel-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept={EXCEL_ACCEPT} multiple onChange={onInputChange} />
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
          <span className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
            <FileSpreadsheet className="h-16 w-16" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{excelFile.name}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatKb(excelFile.size)} KB</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeFile(index);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-red-200 hover:text-[#FF2D2D]"
            aria-label={`Remove ${excelFile.name}`}
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

  function renderPdfNotice() {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-snug text-amber-800 xl:w-[24rem]">
        Basic PDF file generated. Complex layouts may not be fully preserved.
      </div>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5">
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
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            {renderPdfNotice()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:max-w-sm">{error}</p>}
          <div className="min-w-0 xl:ml-auto">
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
        </div>
      </div>
    );
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
          <input id="excel-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept={EXCEL_ACCEPT} multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "arrange" && isActionBarVisible && renderBottomActionBar()}
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
