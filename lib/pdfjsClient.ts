"use client";

import "client-only";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export async function loadPdfJs() {
  if (typeof window === "undefined") {
    throw new Error("PDF.js can only be loaded in the browser.");
  }

  if (pdfjsLib.GlobalWorkerOptions.workerSrc !== "/pdf.worker.min.mjs") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  return pdfjsLib;
}
