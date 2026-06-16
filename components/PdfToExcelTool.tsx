"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileSpreadsheet, FileText, RotateCcw, UploadCloud } from "lucide-react";

type ExcelResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  tableCount: number;
  rowCount: number;
};

type TextItem = {
  str: string;
  transform: number[];
};

type TablePreview = {
  pageNumber: number;
  rows: string[][];
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

function splitTableRow(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cell.trim()).filter(Boolean);
  }

  const wideSpaceSplit = trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  if (wideSpaceSplit.length >= 2) {
    return wideSpaceSplit;
  }

  const numberAwareSplit = trimmed.match(/[A-Za-z][A-Za-z\s./()-]*|\d[\d,.:/%-]*|₹\s*\d[\d,.]*/g);
  if (numberAwareSplit && numberAwareSplit.length >= 2) {
    return numberAwareSplit.map((cell) => cell.trim()).filter(Boolean);
  }

  return [trimmed];
}

function extractRowsFromTextItems(items: TextItem[]) {
  const grouped = new Map<number, TextItem[]>();

  items.forEach((item) => {
    const text = item.str.trim();
    if (!text) {
      return;
    }
    const y = Math.round(item.transform[5] / 4) * 4;
    grouped.set(y, [...(grouped.get(y) ?? []), item]);
  });

  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) =>
      lineItems
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((item) => item.str)
        .join("  "),
    )
    .map(splitTableRow)
    .filter((row) => row.length > 0);
}

function normalizeTableRows(rows: string[][]) {
  const tableRows = rows.filter((row) => row.length >= 2);
  if (tableRows.length >= 2) {
    const maxColumns = Math.max(...tableRows.map((row) => row.length));
    return tableRows.map((row) => [...row, ...Array.from({ length: maxColumns - row.length }, () => "")]);
  }

  return rows.map((row) => [row.join(" ")]);
}

export function PdfToExcelTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<TablePreview[]>([]);
  const [result, setResult] = useState<ExcelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to extract tables into Excel.");

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFile(null);
    setPreviews([]);
    setError(null);
    setProgress(0);
    setStatus("Upload a PDF file to extract tables into Excel.");
    setIsProcessing(false);
  }

  function selectFile(nextFile: File) {
    if (!isPdf(nextFile)) {
      setError("Please upload a valid PDF file.");
      return;
    }

    clearResult();
    setFile(nextFile);
    setPreviews([]);
    setError(null);
    setProgress(0);
    setStatus("PDF selected. Click Convert to Excel.");
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

  async function convertToExcel() {
    if (!file) {
      setError("Please upload a PDF file first.");
      return;
    }

    clearResult();
    setPreviews([]);
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      setStatus("Reading PDF tables...");
      const [pdfjsLib, xlsx] = await Promise.all([import("pdfjs-dist"), import("xlsx")]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const workbook = xlsx.utils.book_new();
      const nextPreviews: TablePreview[] = [];
      let tableCount = 0;
      let rowCount = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Extracting tables from page ${pageNumber} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const rows = normalizeTableRows(extractRowsFromTextItems(content.items as TextItem[]));

        if (rows.length) {
          tableCount += 1;
          rowCount += rows.length;
          const sheet = xlsx.utils.aoa_to_sheet(rows);
          const columnWidths = rows[0].map((_, index) => ({
            wch: Math.min(32, Math.max(10, ...rows.map((row) => String(row[index] ?? "").length))),
          }));
          sheet["!cols"] = columnWidths;
          xlsx.utils.book_append_sheet(workbook, sheet, `Page ${pageNumber}`.slice(0, 31));
          nextPreviews.push({ pageNumber, rows: rows.slice(0, 6).map((row) => row.slice(0, 6)) });
          setPreviews([...nextPreviews]);
        }

        setProgress(Math.round((pageNumber / pdf.numPages) * 90));
      }

      if (!tableCount) {
        throw new Error("No readable table data found. Scanned PDFs may need OCR first.");
      }

      setStatus("Creating Excel file...");
      const excelBytes = xlsx.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const blob = new Blob([excelBytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        tableCount,
        rowCount,
      });
      setProgress(100);
      setStatus("Excel file generated. Complex layouts may need manual adjustment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PDF to Excel. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="pdf-to-excel-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="pdf-excel-upload"
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
            <input id="pdf-excel-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FileSpreadsheet className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload a text-based PDF and extract table-like data into XLSX sheets.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDF
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["XLSX Output", "Table Preview", "No Login"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">PDF to Excel</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Extract readable table data from PDF into Excel XLSX. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
            Excel file generated. Complex layouts may need manual adjustment.
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
              onClick={() => void convertToExcel()}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isProcessing ? "Converting..." : "Convert to Excel"}
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
              <p className="text-sm font-black text-slate-950">XLSX ready: {result.sizeKb.toFixed(1)} KB</p>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Extracted {result.rowCount} rows across {result.tableCount} sheet{result.tableCount === 1 ? "" : "s"}.
              </p>
              <a
                href={result.url}
                download={`${cleanFileName(file?.name || "PDFRoot")}.xlsx`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Download Excel
                <Download className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>

      {previews.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-lg font-black text-slate-950">Extracted Table Preview</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Showing first rows from detected PDF tables.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {previews.slice(0, 4).map((preview) => (
              <div key={preview.pageNumber} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-950">Page {preview.pageNumber}</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={`${preview.pageNumber}-${rowIndex}`} className="border-b border-slate-100 last:border-0">
                          {row.map((cell, cellIndex) => (
                            <td key={`${preview.pageNumber}-${rowIndex}-${cellIndex}`} className="max-w-40 truncate px-3 py-2 font-semibold text-slate-700">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
