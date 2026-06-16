"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileSpreadsheet, FileText, RotateCcw, UploadCloud } from "lucide-react";

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  pages: number;
  sheetCount: number;
};

type SheetData = {
  name: string;
  rows: string[][];
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

function cleanFileName(name: string) {
  return name.replace(/\.(xlsx?|XLSX?)$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function trimSheetRows(rows: unknown[][]) {
  return rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

export function ExcelToPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload an XLS or XLSX file to convert into PDF.");

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
    setStatus("Upload an XLS or XLSX file to convert into PDF.");
    setIsProcessing(false);
  }

  function selectFile(nextFile: File) {
    if (!isExcelFile(nextFile)) {
      setError("Please upload a valid XLS or XLSX Excel file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setError(null);
    setProgress(0);
    setStatus("Excel file selected. Click Convert to PDF.");
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
      setError("Please upload an Excel file first.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      setStatus("Reading Excel workbook...");
      const [{ read, utils }, { jsPDF }] = await Promise.all([import("xlsx"), import("jspdf")]);
      const workbook = read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheets: SheetData[] = workbook.SheetNames.map((name) => ({
        name,
        rows: trimSheetRows(utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]),
      })).filter((sheet) => sheet.rows.length > 0);

      if (!sheets.length) {
        throw new Error("No readable table data found in this Excel file.");
      }

      setProgress(30);
      setStatus("Creating PDF tables...");
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
        setStatus(`Converting sheet ${index + 1} of ${sheets.length}: ${sheet.name}`);
        addSheet(sheet, index);
        setProgress(30 + Math.round(((index + 1) / sheets.length) * 60));
      });

      const blob = pdf.output("blob");
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pages: pdf.getNumberOfPages(),
        sheetCount: sheets.length,
      });
      setProgress(100);
      setStatus("Excel converted to PDF successfully. Tables and basic formatting are preserved where possible.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this Excel file to PDF. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="excel-to-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="excel-pdf-upload"
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
              id="excel-pdf-upload"
              className="sr-only"
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onInputChange}
            />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FileSpreadsheet className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Excel File</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload XLS or XLSX files and convert sheets into clean PDF tables.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Excel File
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["XLS/XLSX", "Table Layout", "No Login"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Excel to PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert spreadsheet tables into a PDF document. Mobile friendly and no login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No Excel file uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
            Basic table formatting is preserved where possible. Very wide sheets may be limited to readable columns.
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
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
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
              <p className="mt-1 text-sm font-bold text-slate-500">
                Converted {result.sheetCount} sheet{result.sheetCount === 1 ? "" : "s"} into {result.pages} PDF page{result.pages === 1 ? "" : "s"}.
              </p>
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
