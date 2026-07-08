"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, FileText, FileType2, RotateCcw, UploadCloud } from "lucide-react";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a DOCX file to convert into PDF.");

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
    setIsProcessing(false);
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
    setIsProcessing(true);
    setProgress(0);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this Word file to PDF. Please try another DOCX file.");
      setStatus("Conversion failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="word-to-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="word-pdf-upload"
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
              id="word-pdf-upload" name="word-pdf-upload"
              className="sr-only"
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onInputChange}
            />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <FileType2 className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop Word File</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload DOCX for best results. The converter keeps headings, paragraphs, bold/italic text, and simple tables where possible.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose Word File
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Editable Source", "Fast Processing", "No Login"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Word to PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Convert DOCX files into clean PDF documents. No login required.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected file</p>
            <p className="mt-2 break-words text-sm font-black text-slate-950">{file?.name || "No Word file uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
            DOCX is supported in-browser. Legacy .doc files may need to be saved as .docx first.
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
              <FileType2 className="h-5 w-5" aria-hidden="true" />
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
              <p className="mt-1 text-sm font-bold text-slate-500">Generated {result.pages} page{result.pages === 1 ? "" : "s"}.</p>
              {result.messages.length > 0 && <p className="mt-2 text-xs font-bold leading-5 text-amber-700">{result.messages[0]}</p>}
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
