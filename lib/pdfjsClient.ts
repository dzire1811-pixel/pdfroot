"use client";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

export async function loadPdfJs() {
  const pdfjsLib: PdfJsModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}
