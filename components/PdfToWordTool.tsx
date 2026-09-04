"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, FileType2, GripVertical, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import {
  Document,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  SectionType,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from "docx";
import JSZip from "jszip";
import { loadPdfJs } from "@/lib/pdfjsClient";
import { analyzePdfPage, PdfPageAnalysis } from "@/lib/pdfToWord/pageAnalyzer";
import { classifyDocumentRegions, LayoutLine } from "@/lib/pdfToWord/layoutAnalyzer";
import { createLocalOcrEngine, LocalOcrResult, OcrWord } from "@/lib/pdfToWord/localOcr";
import { selectPdfToWordEngine } from "@/lib/pdfToWord/engine";
import { correctTextItemsFromGlyphStreams, createPdfGlyphUnicodeResolver } from "@/lib/pdfToWord/pdfGlyphUnicode";
import { createReflowContent, createStructuredPageContent, detectReliableTables } from "@/lib/pdfToWord/reflowRenderer";
import { validateConvertedPages, validateGeneratedDocumentXml } from "@/lib/pdfToWord/validator";
import { compatibleWordFont, hasReliableUnicodeMapping, reconstructGujaratiFragments, validateGujaratiText } from "@/lib/pdfToWord/unicode";

type WordResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  pageCount: number;
  wordCount: number;
  fileCount: number;
  isZip: boolean;
  warning?: string;
};

type ConversionMode = "fixed" | "reflow" | "preserve";

type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
  width: number;
  height: number;
  fontName: string;
  transform: number[];
  unicodeReliable?: boolean;
};

type PdfTextStyle = {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  fontWeight?: string;
  italicAngle?: number;
  sourceFontFamily?: string;
  sourceIsSystemFont?: boolean;
};

type PositionedTextItem = {
  text: string;
  x: number;
  top: number;
  baseline: number;
  width: number;
  height: number;
  fontSize: number;
  fontAscent: number;
  fontDescent: number;
  fontFamily: string;
  sourceFontFamily: string;
  sourceIsSystemFont: boolean;
  fontName: string;
  bold: boolean;
  italic: boolean;
  rotation: number;
  horizontalScale: number;
  sourceOrder: number;
  unicodeReliable: boolean;
};

type PositionedLine = {
  items: PositionedTextItem[];
  x: number;
  top: number;
  width: number;
  height: number;
  centered: boolean;
  color: string;
};

type PdfVectorShape = {
  kind: "rectangle" | "line" | "path";
  x: number;
  top: number;
  width: number;
  height: number;
  strokeWidth: number;
  strokeColor?: string;
  fillColor?: string;
  strokeOpacity: number;
  fillOpacity: number;
  dash: number[];
  lineCap: "flat" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  rotation: number;
  path?: string;
};

type ConvertedPage = {
  width: number;
  height: number;
  image: Uint8Array;
  lines: PositionedLine[];
  tableLayoutLines?: PositionedLine[];
  images: Array<{
    data: Uint8Array;
    x: number;
    top: number;
    width: number;
    height: number;
    background?: boolean;
    border?: { x: number; top: number; width: number; height: number; color: string; thickness: number };
  }>;
  shapes: PdfVectorShape[];
  contentBounds: { left: number; top: number; right: number; bottom: number };
  analysis: PdfPageAnalysis;
  ocr?: { confidence: number; lowConfidenceWords: number };
};

type WorkflowStep = "arrange" | "convert" | "download";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function compactFileName(fileName: string, maxLength = 30) {
  if (fileName.length <= maxLength) return fileName;
  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const available = Math.max(8, maxLength - extension.length - 3);
  const headLength = Math.max(5, available - 4);
  const tailLength = Math.max(0, available - headLength);
  return `${baseName.slice(0, headLength)}...${tailLength ? baseName.slice(-tailLength) : ""}${extension}`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "") || "PDFRoot";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) return resolve(blob);
      reject(new Error("Could not render the PDF page."));
    }, type, quality);
  });
}

async function renderFirstPageThumbnail(file: File) {
  const pdfjsLib = await loadPdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  let page: Awaited<ReturnType<typeof pdf.getPage>> | null = null;
  const canvas = document.createElement("canvas");

  try {
    page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.55 });
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Your browser does not support PDF preview rendering.");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return URL.createObjectURL(await canvasToBlob(canvas, "image/jpeg", 0.82));
  } finally {
    page?.cleanup();
    canvas.width = 0;
    canvas.height = 0;
    await loadingTask.destroy();
  }
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function normalizePdfFontName(fontName: string) {
  return fontName
    .replace(/^[A-Z0-9]{6}\+/i, "")
    .replace(/[-_,](?:BoldItalic|BoldOblique|Bold|Semibold|Demi|Italic|Oblique|Regular|Roman)$/i, "")
    .trim();
}

const fontAvailabilityCache = new Map<string, boolean>();

function browserHasFont(fontName: string) {
  if (!fontName || typeof document === "undefined") return false;
  const cached = fontAvailabilityCache.get(fontName);
  if (cached !== undefined) return cached;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;
  const sample = "mmmmmmmmmmlli ગુજરાતી हिंदी";
  const cleanName = fontName.replace(/["\\]/g, "");
  const available = ["monospace", "serif", "sans-serif"].some((fallback) => {
    context.font = `72px ${fallback}`;
    const baseline = context.measureText(sample).width;
    context.font = `72px "${cleanName}", ${fallback}`;
    return Math.abs(context.measureText(sample).width - baseline) > 0.1;
  });
  fontAvailabilityCache.set(fontName, available);
  return available;
}

function detectTextColor(context: CanvasRenderingContext2D, line: PositionedLine, scale: number) {
  const left = Math.max(0, Math.floor(line.x * scale));
  const top = Math.max(0, Math.floor(line.top * scale));
  const width = Math.max(1, Math.min(context.canvas.width - left, Math.ceil(line.width * scale)));
  const height = Math.max(1, Math.min(context.canvas.height - top, Math.ceil(line.height * scale)));
  if (!width || !height) return "000000";

  const pixels = context.getImageData(left, top, width, height).data;
  let darkest = { luminance: 256, red: 0, green: 0, blue: 0 };
  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] < 180) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (luminance < darkest.luminance) darkest = { luminance, red, green, blue };
  }
  return `${toHex(darkest.red)}${toHex(darkest.green)}${toHex(darkest.blue)}`;
}

function buildPositionedLines(
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
  items: PdfTextItem[],
  styles: Record<string, PdfTextStyle>,
  viewport: { transform: number[]; width: number; height: number },
) {
  const positioned = items
    .filter((item) => item.str.trim() && item.height > 0 && item.transform.length >= 6)
    .map<PositionedTextItem>((item, sourceOrder) => {
      const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const verticalScale = Math.max(0.01, Math.hypot(transform[2], transform[3]));
      const horizontalScale = Math.max(0.01, Math.hypot(transform[0], transform[1]));
      const fontSize = verticalScale;
      const style = styles[item.fontName] ?? {};
      const ascent = style.ascent ?? 0.8;
      const sourceFontFamily = normalizePdfFontName(style.sourceFontFamily ?? style.fontFamily ?? "");
      const sourceIsSystemFont = Boolean(style.sourceIsSystemFont);
      const fontFamily = compatibleWordFont(sourceFontFamily, item.fontName, item.str, sourceIsSystemFont);
      const fontDescriptor = `${style.fontFamily ?? ""} ${item.fontName}`;
      return {
        text: item.str,
        x: transform[4],
        top: transform[5] - fontSize * ascent,
        baseline: transform[5],
        width: Math.max(0.5, item.width),
        height: fontSize,
        fontSize,
        fontAscent: ascent,
        fontDescent: Math.abs(style.descent ?? 0.2),
        fontFamily,
        sourceFontFamily,
        sourceIsSystemFont,
        fontName: item.fontName,
        bold: style.fontWeight === "bold" || /bold|semibold|demi|black/i.test(fontDescriptor),
        italic: /italic|oblique/i.test(fontDescriptor) || Math.abs(style.italicAngle ?? 0) > 0.1,
        rotation: Math.atan2(transform[1], transform[0]) * (180 / Math.PI),
        horizontalScale: horizontalScale / verticalScale,
        sourceOrder,
        unicodeReliable: item.unicodeReliable !== false,
      };
    })
    .sort((a, b) => {
      const baselineDifference = a.baseline - b.baseline;
      if (Math.abs(baselineDifference) > Math.max(1.5, Math.max(a.height, b.height) * 0.22)) return baselineDifference;
      return Math.abs(a.x - b.x) <= 0.5 ? a.sourceOrder - b.sourceOrder : a.x - b.x;
    });

  const rows: PositionedTextItem[][] = [];
  for (const item of positioned) {
    const row = rows.find((candidate) => Math.abs(candidate[0].baseline - item.baseline) <= Math.max(1.5, item.height * 0.22));
    if (row) row.push(item);
    else rows.push([item]);
  }

  const lines: PositionedLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => Math.abs(a.x - b.x) <= 0.5 ? a.sourceOrder - b.sourceOrder : a.x - b.x);
    const reconstructedRow = reconstructGujaratiFragments(row);
    let cluster: PositionedTextItem[] = [];
    const pushCluster = () => {
      if (!cluster.length) return;
      const x = Math.min(...cluster.map((item) => item.x));
      const top = Math.min(...cluster.map((item) => item.top));
      const right = Math.max(...cluster.map((item) => item.x + item.width));
      const bottom = Math.max(...cluster.map((item) => item.top + item.height * 1.18));
      const width = right - x;
      const midpoint = x + width / 2;
      const centered = Math.abs(midpoint - viewport.width / 2) < viewport.width * 0.045 && x > viewport.width * 0.12 && right < viewport.width * 0.88;
      lines.push({ items: cluster, x, top, width, height: bottom - top, centered, color: "000000" });
      cluster = [];
    };

    for (const item of reconstructedRow) {
      const previous = cluster.at(-1);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > Math.max(28, Math.max(previous.height, item.height) * 3.25)) pushCluster();
      cluster.push(item);
    }
    pushCluster();
  }
  return lines.sort((a, b) => a.top - b.top || a.x - b.x);
}

function buildOcrLines(words: OcrWord[], sourceScale: number, pageWidth: number) {
  const items = words.map<PositionedTextItem>((word) => {
    const x = word.bbox.x0 / sourceScale;
    const top = word.bbox.y0 / sourceScale;
    const width = Math.max(0.5, (word.bbox.x1 - word.bbox.x0) / sourceScale);
    const height = Math.max(6, (word.bbox.y1 - word.bbox.y0) / sourceScale);
    const fontSize = Math.max(6, height * 0.82);
    return {
      text: `${word.text} `, x, top, width, height, fontSize,
      baseline: top + height * 0.82, fontAscent: 0.8, fontDescent: 0.2,
      fontFamily: compatibleWordFont("Arial", "OCR-Arial", word.text, true), fontName: "OCR-Arial", sourceFontFamily: "Arial", sourceIsSystemFont: true, bold: false, italic: false,
      rotation: 0, horizontalScale: 1,
      sourceOrder: 0,
      unicodeReliable: true,
    };
  }).sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: PositionedTextItem[][] = [];
  items.forEach((item) => {
    const row = rows.find((candidate) => Math.abs(candidate[0].baseline - item.baseline) <= Math.max(3, item.height * 0.45));
    if (row) row.push(item); else rows.push([item]);
  });
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const x = Math.min(...row.map((item) => item.x));
    const top = Math.min(...row.map((item) => item.top));
    row.forEach((item) => { item.top = top; item.baseline = top + item.height * 0.82; });
    const right = Math.max(...row.map((item) => item.x + item.width));
    const bottom = Math.max(...row.map((item) => item.top + item.height));
    return { items: row, x, top, width: right - x, height: bottom - top, centered: Math.abs((x + right) / 2 - pageWidth / 2) < pageWidth * 0.04, color: "000000" };
  }).sort((a, b) => a.top - b.top || a.x - b.x);
}

async function recognizeScannedPage(
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>["getPage"]>>,
  engine: Awaited<ReturnType<typeof createLocalOcrEngine>>,
  onProgress?: (progress: number) => void,
) {
  const scale = 300 / 72;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("OCR could not create a local page canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { result: await engine.recognize(canvas, onProgress), scale };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function resolvePageFontStyles(
  page: unknown,
  items: PdfTextItem[],
  styles: Record<string, PdfTextStyle>,
) {
  type PdfFontObject = { name?: string; fallbackName?: string; data?: Uint8Array; missingFile?: boolean; systemFontInfo?: unknown };
  const commonObjects = (page as { commonObjs?: { get: (id: string, callback?: (value: PdfFontObject) => void) => PdfFontObject } }).commonObjs;
  if (!commonObjects) return styles;
  const mappings: Array<{ source: string; family: string; fallback: string; embedded: boolean; system: boolean }> = [];
  for (const fontName of [...new Set(items.map((item) => item.fontName))]) {
    let fontObject: PdfFontObject | undefined;
    try {
      fontObject = commonObjects.get(fontName);
    } catch {
      fontObject = await new Promise((resolve) => commonObjects.get(fontName, resolve));
    }
    const sourceName = normalizePdfFontName(fontObject?.name ?? fontName);
    const installedFont = browserHasFont(sourceName);
    const sourceIsSystemFont = installedFont || Boolean(fontObject?.systemFontInfo) && !fontObject?.missingFile && !fontObject?.data?.byteLength;
    const family = compatibleWordFont(sourceName, fontObject?.fallbackName ?? fontName, "", sourceIsSystemFont);
    styles[fontName] = {
      ...(styles[fontName] ?? {}),
      fontFamily: family,
      sourceFontFamily: sourceName,
      sourceIsSystemFont,
      fontWeight: /bold|semibold|demi|black/i.test(fontObject?.name ?? "") ? "bold" : "normal",
      italicAngle: /italic|oblique/i.test(fontObject?.name ?? "") ? -12 : 0,
    };
    mappings.push({ source: fontObject?.name ?? fontName, family, fallback: fontObject?.fallbackName ?? family, embedded: Boolean(fontObject?.data?.byteLength), system: sourceIsSystemFont });
  }
  console.info("[PDFRoot Editable Word] PDF font mappings", mappings);
  return styles;
}

function isInk(red: number, green: number, blue: number) {
  return red + green + blue < 705 || Math.max(red, green, blue) - Math.min(red, green, blue) > 22;
}

function pointInsideText(x: number, y: number, lines: PositionedLine[], padding = 1.5) {
  return lines.some((line) => x >= line.x - padding && x <= line.x + line.width + padding && y >= line.top - padding && y <= line.top + line.height + padding);
}

async function cropCanvasRegion(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  const context = cropped.getContext("2d", { alpha: false });
  if (!context) return undefined;
  try {
    context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return new Uint8Array(await (await canvasToBlob(cropped, "image/png")).arrayBuffer());
  } finally {
    cropped.width = 0;
    cropped.height = 0;
  }
}

type PdfImageObject = { width: number; height: number; kind?: number; data?: Uint8ClampedArray | Uint8Array; bitmap?: ImageBitmap };

async function pdfImageObjectToPng(image: PdfImageObject) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return undefined;
  try {
    if (image.bitmap) {
      context.drawImage(image.bitmap, 0, 0);
    } else if (image.data) {
      const rgba = new Uint8ClampedArray(image.width * image.height * 4);
      if (image.kind === 3 || image.data.length === rgba.length) {
        rgba.set(image.data);
      } else if (image.kind === 2 || image.data.length === image.width * image.height * 3) {
        for (let source = 0, target = 0; source < image.data.length; source += 3, target += 4) {
          rgba[target] = image.data[source];
          rgba[target + 1] = image.data[source + 1];
          rgba[target + 2] = image.data[source + 2];
          rgba[target + 3] = 255;
        }
      } else {
        return undefined;
      }
      context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
    } else {
      return undefined;
    }
    return new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function extractEmbeddedImages(
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
  page: unknown,
  viewport: { transform: number[] },
) {
  const typedPage = page as {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (id: string, callback?: (value: PdfImageObject) => void) => PdfImageObject };
  };
  const operators = await typedPage.getOperatorList();
  const placements: Array<{ id: string; x: number; top: number; width: number; height: number }> = [];
  let ctm = viewport.transform.slice(0, 6) as Matrix;
  const stack: Matrix[] = [];
  operators.fnArray.forEach((operation, index) => {
    if (operation === pdfjsLib.OPS.save) {
      stack.push([...ctm] as Matrix);
    } else if (operation === pdfjsLib.OPS.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (operation === pdfjsLib.OPS.transform) {
      const values = operators.argsArray[index] as number[];
      if (values.length >= 6) ctm = multiplyMatrix(ctm, values.slice(0, 6).map(Number) as Matrix);
    } else if (operation === pdfjsLib.OPS.paintImageXObject) {
      const id = String(operators.argsArray[index]?.[0] ?? "");
      if (!id) return;
      const corners = [transformPoint(ctm, 0, 0), transformPoint(ctm, 1, 0), transformPoint(ctm, 0, 1), transformPoint(ctm, 1, 1)];
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      placements.push({ id, x: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    }
  });
  const images: Array<{ data: Uint8Array; width: number; height: number; x?: number; top?: number; displayWidth?: number; displayHeight?: number }> = [];
  const decoded = new Map<string, { object: PdfImageObject; data?: Uint8Array }>();
  for (const placement of placements) {
    let cached = decoded.get(placement.id);
    if (!cached) {
      let imageObject: PdfImageObject;
      try {
        imageObject = typedPage.objs.get(placement.id);
      } catch {
        imageObject = await new Promise((resolve) => typedPage.objs.get(placement.id, resolve));
      }
      cached = { object: imageObject, data: await pdfImageObjectToPng(imageObject) };
      decoded.set(placement.id, cached);
    }
    const { object: imageObject, data } = cached;
    if (data) images.push({ data, width: imageObject.width, height: imageObject.height, x: placement.x, top: placement.top, displayWidth: placement.width, displayHeight: placement.height });
  }
  return images;
}

type Matrix = [number, number, number, number, number, number];

type VectorState = {
  ctm: Matrix;
  lineWidth: number;
  strokeColor?: string;
  fillColor?: string;
  strokeOpacity: number;
  fillOpacity: number;
  dash: number[];
  lineCap: PdfVectorShape["lineCap"];
  lineJoin: PdfVectorShape["lineJoin"];
};

type PathCommand = { op: 0 | 1 | 2 | 3 | 4; values: number[] };

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPoint(matrix: Matrix, x: number, y: number) {
  return { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] };
}

function normalizePdfColor(args: unknown[], mode: "gray" | "rgb" | "cmyk") {
  const first = args[0];
  if (typeof first === "string" && /^#?[0-9a-f]{6}$/i.test(first)) return first.replace("#", "").toUpperCase();
  const numbers = (Array.isArray(first) || ArrayBuffer.isView(first as ArrayBufferView) ? Array.from(first as ArrayLike<number>) : args)
    .map(Number).filter(Number.isFinite);
  const unit = (value: number) => value > 1 ? value / 255 : value;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (mode === "gray") red = green = blue = unit(numbers[0] ?? 0);
  if (mode === "rgb") [red, green, blue] = [unit(numbers[0] ?? 0), unit(numbers[1] ?? 0), unit(numbers[2] ?? 0)];
  if (mode === "cmyk") {
    const [cyan, magenta, yellow, black] = numbers.map(unit);
    red = 1 - Math.min(1, (cyan ?? 0) + (black ?? 0));
    green = 1 - Math.min(1, (magenta ?? 0) + (black ?? 0));
    blue = 1 - Math.min(1, (yellow ?? 0) + (black ?? 0));
  }
  return `${toHex(red * 255)}${toHex(green * 255)}${toHex(blue * 255)}`;
}

function parsePathCommands(raw: unknown): PathCommand[] {
  if (Array.isArray(raw) && raw.length === 1 && (Array.isArray(raw[0]) || ArrayBuffer.isView(raw[0] as ArrayBufferView))) raw = raw[0];
  if (!(Array.isArray(raw) || ArrayBuffer.isView(raw as ArrayBufferView))) return [];
  const values = Array.from(raw as ArrayLike<number>).map(Number);
  const commands: PathCommand[] = [];
  const lengths: Record<number, number> = { 0: 2, 1: 2, 2: 6, 3: 4, 4: 0 };
  for (let index = 0; index < values.length;) {
    const op = values[index++] as PathCommand["op"];
    const length = lengths[op];
    if (length === undefined || index + length > values.length) break;
    commands.push({ op, values: values.slice(index, index + length) });
    index += length;
  }
  return commands;
}

function transformedCommands(commands: PathCommand[], matrix: Matrix) {
  return commands.map((command) => {
    if (command.op === 4) return command;
    const values: number[] = [];
    for (let index = 0; index < command.values.length; index += 2) {
      const transformed = transformPoint(matrix, command.values[index], command.values[index + 1]);
      values.push(transformed.x, transformed.y);
    }
    return { ...command, values };
  });
}

function pathBounds(commands: PathCommand[]) {
  const coordinates = commands.flatMap((command) => command.values);
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  if (!xs.length || !ys.length) return undefined;
  return { x: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function vmlPath(commands: PathCommand[], bounds: { x: number; top: number; right: number; bottom: number }) {
  const width = Math.max(0.01, bounds.right - bounds.x);
  const height = Math.max(0.01, bounds.bottom - bounds.top);
  const coordinate = (value: number, start: number, span: number) => Math.round((value - start) / span * 10000);
  return commands.map((command) => {
    if (command.op === 4) return "x";
    const values: number[] = [];
    for (let index = 0; index < command.values.length; index += 2) {
      values.push(coordinate(command.values[index], bounds.x, width), coordinate(command.values[index + 1], bounds.top, height));
    }
    if (command.op === 0) return `m ${values.join(",")}`;
    if (command.op === 1) return `l ${values.join(",")}`;
    if (command.op === 2) return `c ${values.join(",")}`;
    if (command.op === 3) return `qb ${values.join(",")}`;
    return "";
  }).filter(Boolean).join(" ") + " e";
}

async function rasterizeUnsupportedPath(
  commands: PathCommand[], state: VectorState, paintOperation: number,
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
) {
  const bounds = pathBounds(commands);
  if (!bounds) return undefined;
  const xScale = Math.hypot(state.ctm[0], state.ctm[1]);
  const yScale = Math.hypot(state.ctm[2], state.ctm[3]);
  const strokeWidth = state.lineWidth * (xScale + yScale) / 2;
  const padding = Math.max(1, strokeWidth);
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((bounds.right - bounds.x + padding * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((bounds.bottom - bounds.top + padding * 2) * scale));
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return undefined;
  context.scale(scale, scale);
  context.translate(-bounds.x + padding, -bounds.top + padding);
  context.beginPath();
  commands.forEach((command) => {
    if (command.op === 0) context.moveTo(command.values[0], command.values[1]);
    else if (command.op === 1) context.lineTo(command.values[0], command.values[1]);
    else if (command.op === 2) context.bezierCurveTo(...command.values as [number, number, number, number, number, number]);
    else if (command.op === 3) context.quadraticCurveTo(...command.values as [number, number, number, number]);
    else context.closePath();
  });
  const strokes = [pdfjsLib.OPS.stroke, pdfjsLib.OPS.closeStroke, pdfjsLib.OPS.fillStroke, pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeFillStroke, pdfjsLib.OPS.closeEOFillStroke].includes(paintOperation);
  const fills = [pdfjsLib.OPS.fill, pdfjsLib.OPS.eoFill, pdfjsLib.OPS.fillStroke, pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeFillStroke, pdfjsLib.OPS.closeEOFillStroke].includes(paintOperation);
  if (fills && state.fillColor) {
    context.globalAlpha = state.fillOpacity;
    context.fillStyle = `#${state.fillColor}`;
    context.fill([pdfjsLib.OPS.eoFill, pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeEOFillStroke].includes(paintOperation) ? "evenodd" : "nonzero");
  }
  if (strokes && state.strokeColor) {
    context.globalAlpha = state.strokeOpacity;
    context.strokeStyle = `#${state.strokeColor}`;
    context.lineWidth = strokeWidth;
    context.lineCap = state.lineCap === "flat" ? "butt" : state.lineCap;
    context.lineJoin = state.lineJoin;
    context.setLineDash(state.dash);
    context.stroke();
  }
  try {
    const data = new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
    return { data, x: bounds.x - padding, top: bounds.top - padding, width: bounds.right - bounds.x + padding * 2, height: bounds.bottom - bounds.top + padding * 2 };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function shapeFromPath(commands: PathCommand[], state: VectorState, paintOperation: number, pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>) {
  const bounds = pathBounds(commands);
  if (!bounds) return undefined;
  const points = commands.filter((command) => command.op === 0 || command.op === 1).map((command) => ({ x: command.values[0], y: command.values[1] }));
  const distinctPoints = points.filter((point, index) => points.findIndex((candidate) => Math.abs(candidate.x - point.x) < 0.01 && Math.abs(candidate.y - point.y) < 0.01) === index);
  const closes = commands.some((command) => command.op === 4);
  const hasCurves = commands.some((command) => command.op === 2 || command.op === 3);
  const strokes = [pdfjsLib.OPS.stroke, pdfjsLib.OPS.closeStroke, pdfjsLib.OPS.fillStroke, pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeFillStroke, pdfjsLib.OPS.closeEOFillStroke].includes(paintOperation);
  const fills = [pdfjsLib.OPS.fill, pdfjsLib.OPS.eoFill, pdfjsLib.OPS.fillStroke, pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeFillStroke, pdfjsLib.OPS.closeEOFillStroke].includes(paintOperation);
  if (!strokes && !fills) return undefined;
  const axisAlignedRectangle = closes && !hasCurves && points.length === 4
    && points.every((point, index) => {
      const next = points[(index + 1) % points.length];
      return Math.abs(point.x - next.x) < 0.01 || Math.abs(point.y - next.y) < 0.01;
    });
  const isLine = !hasCurves && commands.filter((command) => command.op === 1).length === 1 && distinctPoints.length === 2;
  const deltaX = isLine ? distinctPoints[1].x - distinctPoints[0].x : 0;
  const deltaY = isLine ? distinctPoints[1].y - distinctPoints[0].y : 0;
  const xScale = Math.hypot(state.ctm[0], state.ctm[1]);
  const yScale = Math.hypot(state.ctm[2], state.ctm[3]);
  const transformedStrokeWidth = state.lineWidth * (xScale + yScale) / 2;
  return {
    kind: axisAlignedRectangle ? "rectangle" : isLine ? "line" : "path",
    x: bounds.x,
    top: bounds.top,
    width: Math.max(0.01, bounds.right - bounds.x),
    height: Math.max(0.01, bounds.bottom - bounds.top),
    strokeWidth: strokes ? Math.max(0.01, transformedStrokeWidth) : 0,
    strokeColor: strokes ? state.strokeColor : undefined,
    fillColor: fills ? state.fillColor : undefined,
    strokeOpacity: state.strokeOpacity,
    fillOpacity: state.fillOpacity,
    dash: [...state.dash],
    lineCap: state.lineCap,
    lineJoin: state.lineJoin,
    rotation: isLine ? Math.atan2(deltaY, deltaX) * 180 / Math.PI : 0,
    path: axisAlignedRectangle ? undefined : vmlPath(commands, bounds),
  } satisfies PdfVectorShape;
}

function consolidateOuterBorder(shapes: PdfVectorShape[], pageWidth: number, pageHeight: number) {
  const candidates = shapes.filter((shape) => shape.kind === "line" && shape.strokeColor && !shape.fillColor && shape.dash.length === 0);
  const horizontal = candidates.filter((shape) => shape.width > pageWidth * 0.75 && shape.height < 2.5);
  const vertical = candidates.filter((shape) => shape.height > pageHeight * 0.75 && shape.width < 2.5);
  if (horizontal.length < 2 || vertical.length < 2) return shapes;
  const top = [...horizontal].sort((a, b) => a.top - b.top)[0];
  const bottom = [...horizontal].sort((a, b) => b.top - a.top)[0];
  const left = [...vertical].sort((a, b) => a.x - b.x)[0];
  const right = [...vertical].sort((a, b) => b.x - a.x)[0];
  const color = top.strokeColor;
  const compatible = [top, bottom, left, right].every((shape) => shape.strokeColor === color)
    && Math.abs(top.x - left.x) < 3 && Math.abs(top.x + top.width - right.x) < 3
    && Math.abs(left.top - top.top) < 3 && Math.abs(left.top + left.height - bottom.top) < 3;
  if (!compatible) return shapes;
  const related = new Set(candidates.filter((shape) => shape.strokeColor === color && (
    (shape.width > pageWidth * 0.75 && (Math.abs(shape.top - top.top) < 2 || Math.abs(shape.top - bottom.top) < 2))
    || (shape.height > pageHeight * 0.75 && (Math.abs(shape.x - left.x) < 2 || Math.abs(shape.x - right.x) < 2))
  )));
  const border: PdfVectorShape = {
    kind: "rectangle",
    x: Math.max(0, left.x), top: Math.max(0, top.top),
    width: Math.min(pageWidth, right.x) - Math.max(0, left.x),
    height: Math.min(pageHeight, bottom.top) - Math.max(0, top.top),
    strokeWidth: [top, bottom, left, right].reduce((sum, shape) => sum + shape.strokeWidth, 0) / 4,
    strokeColor: color, strokeOpacity: top.strokeOpacity, fillOpacity: 0, dash: [],
    lineCap: "flat", lineJoin: "miter", rotation: 0,
  };
  return [border, ...shapes.filter((shape) => !related.has(shape))];
}

async function extractVectorShapes(
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
  page: unknown,
  viewport: { width: number; height: number; transform: number[] },
) {
  const typedPage = page as { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }> };
  const operators = await typedPage.getOperatorList();
  const initial: VectorState = {
    ctm: viewport.transform.slice(0, 6) as Matrix,
    lineWidth: 1, strokeColor: "000000", fillColor: "000000",
    strokeOpacity: 1, fillOpacity: 1, dash: [], lineCap: "flat", lineJoin: "miter",
  };
  let state = initial;
  const stack: VectorState[] = [];
  const shapes: PdfVectorShape[] = [];
  const fallbacks: ConvertedPage["images"] = [];
  const fallbackTasks: Promise<void>[] = [];
  operators.fnArray.forEach((operation, index) => {
    const args = operators.argsArray[index] ?? [];
    if (operation === pdfjsLib.OPS.save) stack.push({ ...state, ctm: [...state.ctm] as Matrix, dash: [...state.dash] });
    else if (operation === pdfjsLib.OPS.restore) state = stack.pop() ?? state;
    else if (operation === pdfjsLib.OPS.transform && args.length >= 6) state = { ...state, ctm: multiplyMatrix(state.ctm, args.slice(0, 6).map(Number) as Matrix) };
    else if (operation === pdfjsLib.OPS.setLineWidth) state = { ...state, lineWidth: Number(args[0] ?? 1) };
    else if (operation === pdfjsLib.OPS.setLineCap) state = { ...state, lineCap: (["flat", "round", "square"] as const)[Number(args[0])] ?? "flat" };
    else if (operation === pdfjsLib.OPS.setLineJoin) state = { ...state, lineJoin: (["miter", "round", "bevel"] as const)[Number(args[0])] ?? "miter" };
    else if (operation === pdfjsLib.OPS.setDash) state = { ...state, dash: Array.from((args[0] ?? []) as ArrayLike<number>).map(Number) };
    else if (operation === pdfjsLib.OPS.setStrokeGray) state = { ...state, strokeColor: normalizePdfColor(args, "gray") };
    else if (operation === pdfjsLib.OPS.setFillGray) state = { ...state, fillColor: normalizePdfColor(args, "gray") };
    else if (operation === pdfjsLib.OPS.setStrokeRGBColor) state = { ...state, strokeColor: normalizePdfColor(args, "rgb") };
    else if (operation === pdfjsLib.OPS.setFillRGBColor) state = { ...state, fillColor: normalizePdfColor(args, "rgb") };
    else if (operation === pdfjsLib.OPS.setStrokeCMYKColor) state = { ...state, strokeColor: normalizePdfColor(args, "cmyk") };
    else if (operation === pdfjsLib.OPS.setFillCMYKColor) state = { ...state, fillColor: normalizePdfColor(args, "cmyk") };
    else if (operation === pdfjsLib.OPS.setStrokeTransparent) state = { ...state, strokeOpacity: 0 };
    else if (operation === pdfjsLib.OPS.setFillTransparent) state = { ...state, fillOpacity: 0 };
    else if (operation === pdfjsLib.OPS.setGState && Array.isArray(args[0])) {
      const entries = args[0] as unknown[][];
      const strokeAlpha = entries.find((entry) => entry[0] === "CA")?.[1];
      const fillAlpha = entries.find((entry) => entry[0] === "ca")?.[1];
      state = { ...state, strokeOpacity: strokeAlpha === undefined ? state.strokeOpacity : Number(strokeAlpha), fillOpacity: fillAlpha === undefined ? state.fillOpacity : Number(fillAlpha) };
    } else if (operation === pdfjsLib.OPS.constructPath) {
      const paintOperation = Number(args[0]);
      const commands = transformedCommands(parsePathCommands(args[1]), state.ctm);
      const shape = shapeFromPath(commands, state, paintOperation, pdfjsLib);
      if (shape && shape.x + shape.width >= 0 && shape.top + shape.height >= 0 && shape.x <= viewport.width && shape.top <= viewport.height) {
        if (shape.kind === "path" && (!shape.path || shape.path.length > 30000)) {
          const snapshot = { ...state, ctm: [...state.ctm] as Matrix, dash: [...state.dash] };
          fallbackTasks.push(rasterizeUnsupportedPath(commands, snapshot, paintOperation, pdfjsLib).then((fallback) => { if (fallback) fallbacks.push(fallback); }));
        } else shapes.push(shape);
      }
    }
  });
  await Promise.all(fallbackTasks);
  return { shapes: consolidateOuterBorder(shapes, viewport.width, viewport.height), fallbacks };
}

async function detectPageGraphics(
  canvas: HTMLCanvasElement,
  lines: PositionedLine[],
  scale: number,
  pageWidth: number,
  pageHeight: number,
) {
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(2, Math.round(scale));
  const gridWidth = Math.floor(canvas.width / step);
  const gridHeight = Math.floor(canvas.height / step);
  const active = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const pageX = x * step / scale;
      const pageY = y * step / scale;
      if (pointInsideText(pageX, pageY, lines, 2)) continue;
      const index = ((y * step) * canvas.width + x * step) * 4;
      if (isInk(pixels[index], pixels[index + 1], pixels[index + 2])) active[y * gridWidth + x] = 1;
    }
  }

  const componentBounds: Array<{ x: number; top: number; width: number; height: number }> = [];
  const queue = new Int32Array(active.length);
  for (let start = 0; start < active.length; start += 1) {
    if (active[start] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    active[start] = 2;
    let left = start % gridWidth;
    let right = left;
    let top = Math.floor(start / gridWidth);
    let bottom = top;
    while (head < tail) {
      const current = queue[head++];
      const x = current % gridWidth;
      const y = Math.floor(current / gridWidth);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
          const next = ny * gridWidth + nx;
          if (active[next] === 1) {
            active[next] = 2;
            queue[tail++] = next;
          }
        }
      }
    }
    const width = (right - left + 1) * step / scale;
    const height = (bottom - top + 1) * step / scale;
    const boxCells = Math.max(1, (right - left + 1) * (bottom - top + 1));
    const density = tail / boxCells;
    const area = width * height;
    const aspect = width / Math.max(1, height);
    if (tail > 100 && width >= 18 && height >= 18 && area >= 500 && area < pageWidth * pageHeight * 0.35 && density > 0.13 && aspect > 0.18 && aspect < 5.5) {
      componentBounds.push({ x: left * step / scale, top: top * step / scale, width, height });
    }
  }

  const images: ConvertedPage["images"] = [];
  for (const bounds of componentBounds) {
    const padding = Math.ceil(scale);
    const sourceX = Math.max(0, Math.floor(bounds.x * scale) - padding);
    const sourceY = Math.max(0, Math.floor(bounds.top * scale) - padding);
    const sourceWidth = Math.min(canvas.width - sourceX, Math.ceil(bounds.width * scale) + padding * 2);
    const sourceHeight = Math.min(canvas.height - sourceY, Math.ceil(bounds.height * scale) + padding * 2);
    const data = await cropCanvasRegion(canvas, sourceX, sourceY, sourceWidth, sourceHeight);
    if (data) {
      const edgeColors = new Map<string, number>();
      const left = Math.max(0, Math.round(bounds.x * scale));
      const right = Math.min(canvas.width - 1, Math.round((bounds.x + bounds.width) * scale));
      const top = Math.max(0, Math.round(bounds.top * scale));
      const bottom = Math.min(canvas.height - 1, Math.round((bounds.top + bounds.height) * scale));
      const sample = (x: number, y: number) => {
        const index = (y * canvas.width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (!isInk(red, green, blue)) return;
        const color = `${toHex(red)}${toHex(green)}${toHex(blue)}`;
        edgeColors.set(color, (edgeColors.get(color) ?? 0) + 1);
      };
      for (let x = left; x <= right; x += Math.max(1, Math.round(scale))) {
        sample(x, top);
        sample(x, bottom);
      }
      for (let y = top; y <= bottom; y += Math.max(1, Math.round(scale))) {
        sample(left, y);
        sample(right, y);
      }
      const dominant = [...edgeColors.entries()].sort((a, b) => b[1] - a[1])[0];
      const perimeterSamples = Math.max(1, ((right - left) + (bottom - top)) * 2 / Math.max(1, Math.round(scale)));
      const measuredThickness = (() => {
        if (!dominant) return 0;
        const target = [parseInt(dominant[0].slice(0, 2), 16), parseInt(dominant[0].slice(2, 4), 16), parseInt(dominant[0].slice(4, 6), 16)];
        const matches = (x: number, y: number) => {
          const index = (y * canvas.width + x) * 4;
          return Math.abs(pixels[index] - target[0]) + Math.abs(pixels[index + 1] - target[1]) + Math.abs(pixels[index + 2] - target[2]) < 96;
        };
        const maxDepth = Math.max(2, Math.round(scale * 8));
        const runs = [
          Array.from({ length: maxDepth }, (_, depth) => matches(Math.round((left + right) / 2), Math.min(bottom, top + depth))),
          Array.from({ length: maxDepth }, (_, depth) => matches(Math.round((left + right) / 2), Math.max(top, bottom - depth))),
          Array.from({ length: maxDepth }, (_, depth) => matches(Math.min(right, left + depth), Math.round((top + bottom) / 2))),
          Array.from({ length: maxDepth }, (_, depth) => matches(Math.max(left, right - depth), Math.round((top + bottom) / 2))),
        ].map((run) => run.findIndex((value) => !value)).map((length) => length < 0 ? maxDepth : length).filter((length) => length > 0).sort((a, b) => a - b);
        return runs.length ? runs[Math.floor(runs.length / 2)] / scale : 0;
      })();
      const border = dominant && dominant[1] / perimeterSamples > 0.2
        ? { x: bounds.x, top: bounds.top, width: bounds.width, height: bounds.height, color: dominant[0], thickness: Math.max(0.5, measuredThickness) }
        : undefined;
      images.push({ data, x: sourceX / scale, top: sourceY / scale, width: sourceWidth / scale, height: sourceHeight / scale, border });
    }
  }

  const maskedByImage = (x: number, y: number) => images.some((image) => x >= image.x - 1 && x <= image.x + image.width + 1 && y >= image.top - 1 && y <= image.top + image.height + 1);
  const horizontalRuns: Array<{ x: number; right: number; y: number; color: string }> = [];
  const gapTolerance = Math.ceil(scale * 1.5);
  const minimumRun = pageWidth * scale * 0.18;
  for (let y = 0; y < canvas.height; y += 1) {
    let start = -1;
    let lastInk = -1;
    for (let x = 0; x <= canvas.width; x += 1) {
      const pageX = x / scale;
      const pageY = y / scale;
      const index = (y * canvas.width + Math.min(x, canvas.width - 1)) * 4;
      // Keep long rules intact even when their antialiasing touches nearby glyphs.
      // The minimum-run threshold filters normal text strokes without cutting bars.
      const ink = x < canvas.width && !maskedByImage(pageX, pageY) && isInk(pixels[index], pixels[index + 1], pixels[index + 2]);
      if (ink) {
        if (start < 0) start = x;
        lastInk = x;
      }
      if (start >= 0 && (x === canvas.width || x - lastInk > gapTolerance)) {
        if (lastInk - start >= minimumRun) {
          const sample = (y * canvas.width + Math.floor((start + lastInk) / 2)) * 4;
          horizontalRuns.push({ x: start / scale, right: lastInk / scale, y: y / scale, color: `${toHex(pixels[sample])}${toHex(pixels[sample + 1])}${toHex(pixels[sample + 2])}` });
        }
        start = -1;
        lastInk = -1;
      }
    }
  }

  const edges: Array<{ x: number; right: number; top: number; bottom: number; color: string }> = [];
  for (const run of horizontalRuns) {
    const matching = [...edges].reverse().find((edge) => run.y - edge.bottom <= 1.5 && run.y >= edge.bottom && Math.abs(run.x - edge.x) <= 2 && Math.abs(run.right - edge.right) <= 2);
    if (matching) {
      matching.bottom = run.y;
      const runInk = parseInt(run.color.slice(0, 2), 16) + parseInt(run.color.slice(2, 4), 16) + parseInt(run.color.slice(4, 6), 16);
      const matchingInk = parseInt(matching.color.slice(0, 2), 16) + parseInt(matching.color.slice(2, 4), 16) + parseInt(matching.color.slice(4, 6), 16);
      if (runInk < matchingInk) matching.color = run.color;
    } else {
      edges.push({ x: run.x, right: run.right, top: run.y, bottom: run.y, color: run.color });
    }
  }
  edges.sort((a, b) => a.top - b.top || a.x - b.x);

  const rectangles: Array<{ x: number; top: number; width: number; height: number; thickness: number; color: string }> = [];
  let pageBorder: { x: number; top: number; width: number; height: number; color: string; thickness: number } | undefined;
  const pairedEdges = new Set<number>();
  for (let index = 0; index < edges.length; index += 1) {
    if (pairedEdges.has(index)) continue;
    const upper = edges[index];
    const lowerIndex = edges.findIndex((edge, candidateIndex) => {
      if (candidateIndex <= index || pairedEdges.has(candidateIndex)) return false;
      const gap = edge.top - upper.bottom;
      return gap >= 5 && gap <= pageHeight * 0.96 && Math.abs(edge.x - upper.x) <= 3 && Math.abs(edge.right - upper.right) <= 3;
    });
    if (lowerIndex < 0) continue;
    const lower = edges[lowerIndex];
    const height = lower.bottom - upper.top;
    const width = Math.max(1, (upper.right + lower.right) / 2 - (upper.x + lower.x) / 2);
    const rectangle = { x: (upper.x + lower.x) / 2, top: upper.top, width, height, thickness: Math.max(0.5, upper.bottom - upper.top + 1 / scale), color: upper.color };
    if (width > pageWidth * 0.8 && height > pageHeight * 0.75) {
      pageBorder = { x: rectangle.x, top: rectangle.top, width: rectangle.width, height: rectangle.height, color: rectangle.color, thickness: rectangle.thickness };
      pairedEdges.add(index);
      pairedEdges.add(lowerIndex);
    } else if (width > pageWidth * 0.25 && height <= Math.max(45, pageHeight * 0.08)) {
      rectangles.push(rectangle);
      pairedEdges.add(index);
      pairedEdges.add(lowerIndex);
    }
  }

  return { images, rectangles, pageBorder };
}

async function renderPdfPage(
  pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>["getPage"]>>,
  mode: ConversionMode,
  analysis: PdfPageAnalysis,
  ocr?: { result: LocalOcrResult; scale: number },
  extractedText?: { items: PdfTextItem[]; styles: Record<string, PdfTextStyle> },
) {
  const layoutViewport = page.getViewport({ scale: 1 });
  const renderScale = mode === "preserve" ? 2.5 : analysis.kinds.includes("simple-flowing-text") && !analysis.imageCount && analysis.vectorCount === 0 ? 1.5 : 2.25;
  const renderViewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: mode !== "preserve" });
  if (!context) throw new Error("Your browser does not support local PDF rendering.");

  try {
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;

    let lines: PositionedLine[] = [];
    let tableLayoutLines: PositionedLine[] | undefined;
    let images: ConvertedPage["images"] = [];
    let shapes: PdfVectorShape[] = [];
    let shapeFallbacks: ConvertedPage["images"] = [];
    if (mode !== "preserve") {
      // ToUnicode is the primary mapping. When it conflicts with the embedded
      // TrueType cmap, extracted glyphs are repaired before layout grouping.
      const rawContent = extractedText ?? await page.getTextContent({ disableNormalization: true });
      const content = {
        items: rawContent.items as PdfTextItem[],
        styles: rawContent.styles as Record<string, PdfTextStyle>,
      };
      const resolvedStyles = await resolvePageFontStyles(
        page,
        content.items,
        content.styles,
      );
      lines = buildPositionedLines(
        pdfjsLib,
        content.items,
        resolvedStyles,
        layoutViewport,
      );
      if (ocr?.result.words.length) lines = buildOcrLines(ocr.result.words, ocr.scale, layoutViewport.width);
      for (const line of lines) {
        line.color = detectTextColor(context, line, renderScale);
      }
      const safeEditableText = (item: PositionedTextItem) => item.unicodeReliable
        && hasReliableUnicodeMapping(item.text) && validateGujaratiText(item.text).length === 0;
      const unreliableMapping = !ocr && lines.some((line) => line.items.some((item) => !safeEditableText(item)));
      if (unreliableMapping) {
        tableLayoutLines = lines;
        analysis.unicodeConfidence = Math.min(analysis.unicodeConfidence, 0.5);
        analysis.strategy = "visual-safe-fallback";
        const safeLines = lines.map((line) => {
          const items = line.items.filter((item) => safeEditableText(item));
          if (!items.length) return undefined;
          const x = Math.min(...items.map((item) => item.x));
          const top = Math.min(...items.map((item) => item.top));
          const right = Math.max(...items.map((item) => item.x + item.width));
          const bottom = Math.max(...items.map((item) => item.top + item.height));
          return { ...line, items, x, top, width: right - x, height: bottom - top };
        }).filter((line): line is PositionedLine => Boolean(line));
        context.fillStyle = "#ffffff";
        for (const line of safeLines) {
          for (const item of line.items) {
            context.fillRect(
              Math.max(0, item.x * renderScale - 2),
              Math.max(0, item.top * renderScale - 2),
              item.width * renderScale + 4,
              item.height * renderScale + 4,
            );
          }
        }
        lines = safeLines;
        images = [{
          data: new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer()),
          x: 0, top: 0, width: layoutViewport.width, height: layoutViewport.height,
          background: mode === "fixed",
        }];
      } else if (ocr?.result.words.length && mode === "fixed") {
        context.fillStyle = "#ffffff";
        for (const word of ocr.result.words) {
          const x = word.bbox.x0 / ocr.scale * renderScale;
          const top = word.bbox.y0 / ocr.scale * renderScale;
          const width = (word.bbox.x1 - word.bbox.x0) / ocr.scale * renderScale;
          const height = (word.bbox.y1 - word.bbox.y0) / ocr.scale * renderScale;
          context.fillRect(Math.max(0, x - 2), Math.max(0, top - 2), width + 4, height + 4);
        }
        images = [{
          data: new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer()),
          x: 0,
          top: 0,
          width: layoutViewport.width,
          height: layoutViewport.height,
          background: true,
        }];
      } else if (analysis.imageCount || analysis.vectorCount > 0) {
        const graphics = await detectPageGraphics(canvas, lines, renderScale, layoutViewport.width, layoutViewport.height);
        images = graphics.images;
        const vectorGraphics = await extractVectorShapes(pdfjsLib, page, layoutViewport);
        shapes = vectorGraphics.shapes;
        shapeFallbacks = vectorGraphics.fallbacks;
        const embeddedImages = await extractEmbeddedImages(pdfjsLib, page, layoutViewport);
        const availableEmbedded = [...embeddedImages];
        images = images.map((detected) => {
        if (!availableEmbedded.length) return detected;
        const detectedRatio = detected.width / Math.max(0.01, detected.height);
        availableEmbedded.sort((a, b) => Math.abs(Math.log((a.width / a.height) / detectedRatio)) - Math.abs(Math.log((b.width / b.height) / detectedRatio)));
        const embedded = availableEmbedded.shift()!;
        const exactPlacement = embedded.x !== undefined && embedded.top !== undefined
          && embedded.displayWidth !== undefined && embedded.displayHeight !== undefined
          && embedded.displayWidth > 0 && embedded.displayHeight > 0
          && embedded.x >= 0 && embedded.top >= 0
          && embedded.x + embedded.displayWidth <= layoutViewport.width + 1
          && embedded.top + embedded.displayHeight <= layoutViewport.height + 1;
        if (exactPlacement) {
          return { ...detected, data: embedded.data, x: embedded.x!, top: embedded.top!, width: embedded.displayWidth!, height: embedded.displayHeight! };
        }
        const inset = detected.border?.thickness ?? 0;
        const availableWidth = Math.max(0.5, detected.width - inset * 2);
        const availableHeight = Math.max(0.5, detected.height - inset * 2);
        const embeddedRatio = embedded.width / embedded.height;
        const width = Math.min(availableWidth, availableHeight * embeddedRatio);
        const height = width / embeddedRatio;
        return {
          ...detected,
          data: embedded.data,
          x: detected.x + (detected.width - width) / 2,
          top: detected.top + (detected.height - height) / 2,
          width,
          height,
        };
        });
        images.push(...shapeFallbacks);
      }
    }

    const horizontalElements = [
      ...lines.map((line) => ({ left: line.x, right: line.x + line.width })),
      ...shapes.map((shape) => ({ left: shape.x, right: shape.x + shape.width })),
      ...images.map((image) => ({ left: image.x, right: image.x + image.width })),
    ];
    const verticalElements = [
      ...lines.map((line) => ({ top: line.top, bottom: line.top + line.height })),
      ...shapes.map((shape) => ({ top: shape.top, bottom: shape.top + shape.height })),
      ...images.map((image) => ({ top: image.top, bottom: image.top + image.height })),
    ];
    const contentBounds = {
      left: horizontalElements.length ? Math.max(0, Math.min(...horizontalElements.map((element) => element.left))) : 0,
      top: verticalElements.length ? Math.max(0, Math.min(...verticalElements.map((element) => element.top))) : 0,
      right: horizontalElements.length ? Math.min(layoutViewport.width, Math.max(...horizontalElements.map((element) => element.right))) : layoutViewport.width,
      bottom: verticalElements.length ? Math.min(layoutViewport.height, Math.max(...verticalElements.map((element) => element.bottom))) : layoutViewport.height,
    };

    return {
      width: layoutViewport.width,
      height: layoutViewport.height,
      image: mode === "preserve" ? new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer()) : new Uint8Array(),
      lines,
      tableLayoutLines,
      images,
      shapes,
      contentBounds,
      analysis,
      ocr: ocr ? { confidence: ocr.result.confidence, lowConfidenceWords: ocr.result.lowConfidenceWords } : undefined,
    } satisfies ConvertedPage;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

function createVisualLayer(page: ConvertedPage, description: string) {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1 },
    children: [
      new ImageRun({
        type: "png",
        data: page.image,
        transformation: { width: page.width * (96 / 72), height: page.height * (96 / 72) },
        altText: { title: description, description, name: description },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          behindDocument: true,
          zIndex: 0,
          allowOverlap: true,
          lockAnchor: true,
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      }),
    ],
  });
}

function anchoredImages(page: ConvertedPage) {
  if (!page.images.length) return undefined;
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1, lineRule: "exact" },
    children: page.images.map((image, index) => new ImageRun({
      type: "png",
      data: image.data,
      transformation: { width: image.width * (96 / 72), height: image.height * (96 / 72) },
      altText: { title: `PDF image ${index + 1}`, description: "Image extracted locally from the source PDF", name: `PDF image ${index + 1}` },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(image.x * 12700) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(image.top * 12700) },
        // Page-relative source coordinates already keep text outside the image
        // region. Word/WPS square wrapping can push unrelated semantic rows
        // down by the full image height, so fixed-layout images never
        // participate in paragraph flow.
        wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
        behindDocument: Boolean(image.background),
        allowOverlap: true,
        lockAnchor: true,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    })),
  });
}

function point(value: number) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function fixedShapeStyle(x: number, top: number, width: number, height: number, zIndex: number, rotation = 0) {
  return [
    "position:absolute",
    `margin-left:${point(x)}pt`,
    `margin-top:${point(top)}pt`,
    `width:${point(Math.max(0.5, width))}pt`,
    `height:${point(Math.max(0.5, height))}pt`,
    `z-index:${zIndex}`,
    "mso-position-horizontal:absolute",
    "mso-position-horizontal-relative:page",
    "mso-position-vertical:absolute",
    "mso-position-vertical-relative:page",
    "mso-wrap-style:none",
    Math.abs(rotation) > 0.01 ? `rotation:${point(rotation)}` : "",
  ].filter(Boolean).join(";");
}

function vmlDashStyle(dash: number[]) {
  if (!dash.length) return "solid";
  if (dash.length === 2 && dash[0] <= dash[1] * 0.35) return "dot";
  if (dash.length === 2) return "dash";
  return "dashdot";
}

function editableVectorShape(shape: PdfVectorShape, id: number) {
  if (!shape.path && shape.kind === "path") return "";
  const stroked = Boolean(shape.strokeColor && shape.strokeWidth > 0 && shape.strokeOpacity > 0);
  const filled = Boolean(shape.fillColor && shape.fillOpacity > 0);
  const stroke = stroked
    ? `<v:stroke color="#${shape.strokeColor}" opacity="${point(shape.strokeOpacity)}" dashstyle="${vmlDashStyle(shape.dash)}" endcap="${shape.lineCap}" joinstyle="${shape.lineJoin}"/>`
    : "";
  const fill = filled ? `<v:fill color="#${shape.fillColor}" opacity="${point(shape.fillOpacity)}"/>` : "";
  const common = `id="pdfroot_vector_${id}" style="${fixedShapeStyle(shape.x, shape.top, shape.width, shape.height, 10 + id)}" filled="${filled ? "t" : "f"}" stroked="${stroked ? "t" : "f"}"${stroked ? ` strokecolor="#${shape.strokeColor}" strokeweight="${point(shape.strokeWidth)}pt"` : ""}${filled ? ` fillcolor="#${shape.fillColor}"` : ""} o:allowoverlap="t"`;
  const noWrap = `<w10:wrap type="none"/>`;
  if (shape.kind === "rectangle") return `<w:r><w:pict><v:rect ${common}>${stroke}${fill}${noWrap}</v:rect></w:pict></w:r>`;
  return `<w:r><w:pict><v:shape ${common} coordorigin="0,0" coordsize="10000,10000" path="${shape.path}">${stroke}${fill}${noWrap}<v:path fillok="${filled ? "t" : "f"}" strokeok="${stroked ? "t" : "f"}"/></v:shape></w:pict></w:r>`;
}

function shapeInsideTable(shape: PdfVectorShape, table: ReturnType<typeof detectReliableTables>[number]) {
  const right = table.xs.at(-1)!;
  const bottom = table.ys.at(-1)!;
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.top + shape.height / 2;
  return centerX >= table.x - 3 && centerX <= right + 3 && centerY >= table.top - 3 && centerY <= bottom + 3;
}

function whiteBackgroundBehindText(shape: PdfVectorShape, lines: PositionedLine[]) {
  if (shape.strokeColor || shape.fillColor !== "FFFFFF" || shape.fillOpacity <= 0 || shape.width <= 2 || shape.height <= 2) return false;
  return lines.some((line) => {
    const centerX = line.x + line.width / 2;
    const centerY = line.top + line.height / 2;
    return centerX >= shape.x && centerX <= shape.x + shape.width && centerY >= shape.top && centerY <= shape.top + shape.height;
  });
}

function editableVectorPageXml(page: ConvertedPage) {
  const tables = detectReliableTables(page.tableLayoutLines ?? page.lines, page.shapes);
  const layout = classifyDocumentRegions({
    lines: page.lines as LayoutLine[],
    shapes: page.shapes,
    images: page.images,
    pageWidth: page.width,
    pageHeight: page.height,
    tables: tables.map((table) => ({ x: table.x, top: table.top, right: table.xs.at(-1)!, bottom: table.ys.at(-1)! })),
  });
  const semanticShapeIndexes = new Set(layout.regions
    .filter((region) => region.kind === "section-heading")
    .flatMap((region) => region.relatedShapeIndexes ?? []));
  const shapes = page.shapes
    .filter((shape, index) => !semanticShapeIndexes.has(index)
      && !tables.some((table) => shapeInsideTable(shape, table))
      && !whiteBackgroundBehindText(shape, page.lines))
    .map((shape, index) => editableVectorShape(shape, index))
    .join("");
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr>${shapes}</w:p>`;
}

function createDocx(pages: ConvertedPage[], sourceName: string, mode: ConversionMode) {
  if (mode === "reflow") {
    const page = pages[0];
    const landscape = page.width > page.height;
    return new Document({
      creator: "PDFRoot",
      title: `${sourceName} converted to editable Word`,
      description: "Locally reconstructed flowing Word paragraphs for major editing.",
      sections: [{
        properties: {
          page: {
            size: { width: Math.round((landscape ? page.height : page.width) * 20), height: Math.round((landscape ? page.width : page.height) * 20), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360, gutter: 0 },
          },
        },
        children: createReflowContent(pages),
      }],
    });
  }
  return new Document({
    creator: "PDFRoot",
    title: `${sourceName} converted to Word`,
    description: mode === "fixed"
      ? "Editable Word file reconstructed locally with page-relative PDF coordinates."
      : "Original PDF appearance preserved locally as one full-page image per Word page.",
    sections: pages.map((page, pageIndex) => {
      const landscape = page.width > page.height;
      const imageLayer = mode === "fixed" ? anchoredImages(page) : undefined;
      const margins = mode === "fixed" ? {
        // Fixed-layout objects share one page-relative coordinate system.
        // Source x/y offsets are represented by paragraph/table indents and
        // vertical spacers; section margins would apply that origin a second
        // time and shrink the usable body in Word/WPS.
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        header: 0,
        footer: 0,
        gutter: 0,
      } : { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 };
      const structuredContent = mode === "fixed" ? createStructuredPageContent(page, {
        fixedLayout: true,
        left: 0,
        top: 0,
      }) : [];
      return {
        properties: {
          type: mode === "fixed" ? SectionType.NEXT_PAGE : pageIndex === pages.length - 1 ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
          page: {
            size: {
              width: Math.round((landscape ? page.height : page.width) * 20),
              height: Math.round((landscape ? page.width : page.height) * 20),
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: margins,
          },
        },
        children: mode === "fixed"
          ? [new Paragraph({ children: [new TextRun(`PDFROOT_VECTOR_PAGE_${pageIndex}`)] }), ...(imageLayer ? [imageLayer] : []), ...structuredContent]
          : [createVisualLayer(page, `Original PDF page ${pageIndex + 1}`)],
      };
    }),
  });
}

async function finalizeDocx(documentFile: Document, pages: ConvertedPage[], mode: ConversionMode) {
  const packed = await Packer.toBlob(documentFile);
  if (packed.size < 1024) throw new Error("The generated Word file is empty or incomplete.");

  const zip = await JSZip.loadAsync(packed);
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile || !zip.file("[Content_Types].xml")) throw new Error("The generated Word file is corrupt.");

  let documentXml = await documentXmlFile.async("string");
  if (mode === "fixed") {
    if (!documentXml.includes("xmlns:v=")) {
      documentXml = documentXml.replace("<w:document ", '<w:document xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ');
    } else if (!documentXml.includes("xmlns:o=")) {
      documentXml = documentXml.replace("<w:document ", '<w:document xmlns:o="urn:schemas-microsoft-com:office:office" ');
    }
    pages.map((page, pageIndex) => ({ page, pageIndex })).reverse().forEach(({ page, pageIndex }) => {
      const token = `PDFROOT_VECTOR_PAGE_${pageIndex}`;
      const paragraphPattern = new RegExp(`<w:p(?: [^>]*)?>(?:(?!<\\/w:p>)[\\s\\S])*?<w:t(?: [^>]*)?>${token}<\\/w:t>(?:(?!<\\/w:p>)[\\s\\S])*?<\\/w:p>`);
      documentXml = documentXml.replace(paragraphPattern, editableVectorPageXml(page));
    });
    const shapeType = '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>';
    if (documentXml.includes("<w:pict>")) documentXml = documentXml.replace("<w:pict>", `<w:pict>${shapeType}`);

    const settingsFile = zip.file("word/settings.xml");
    if (settingsFile) {
      let settingsXml = await settingsFile.async("string");
      if (!settingsXml.includes("doNotUseHTMLParagraphAutoSpacing")) {
        settingsXml = settingsXml.replace("</w:settings>", '<w:doNotUseHTMLParagraphAutoSpacing/><w:doNotTrackFormatting/><w:doNotAutoCompressPictures/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>');
      }
      zip.file("word/settings.xml", settingsXml);
    }
  }
  zip.file("word/document.xml", documentXml);
  validateGeneratedDocumentXml(documentXml, pages);

  // WPS relies more heavily than Word on fontTable.xml when resolving complex
  // scripts. Declare every deterministic run font; never declare PDF subset IDs.
  const fontTableFile = zip.file("word/fontTable.xml");
  if (fontTableFile) {
    const declaredFonts = [...new Set([...documentXml.matchAll(/<w:rFonts\b[^>]*\bw:(?:ascii|hAnsi|eastAsia|cs)="([^"]+)"/g)].map((match) => match[1]))];
    const declarations = declaredFonts.map((font) => {
      const family = /times|serif/i.test(font) ? "roman" : /courier|mono/i.test(font) ? "modern" : "swiss";
      return `<w:font w:name="${font}"><w:altName w:val="${font}"/><w:charset w:val="00"/><w:family w:val="${family}"/><w:pitch w:val="variable"/></w:font>`;
    }).join("");
    let fontTableXml = await fontTableFile.async("string");
    if (declarations) {
      fontTableXml = /<w:fonts\b[^>]*\/>/.test(fontTableXml)
        ? fontTableXml.replace(/<w:fonts\b([^>]*)\/>/, `<w:fonts$1>${declarations}</w:fonts>`)
        : fontTableXml.replace("</w:fonts>", `${declarations}</w:fonts>`);
      zip.file("word/fontTable.xml", fontTableXml);
    }
  }

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (blob.size < 1024) throw new Error("The generated Word file is empty or incomplete.");
  await JSZip.loadAsync(blob);
  return blob;
}

export function PdfToWordTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [conversionMode, setConversionMode] = useState<ConversionMode>("fixed");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [result, setResult] = useState<WordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PDF file to convert into editable Word.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<WordResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PDF" : "PDFs"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("pdf-to-word-tool");
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
    setStatus("Upload a PDF file to convert into editable Word.");
    setIsProcessing(false);
    setWorkflowStep("arrange");
    setDraggedIndex(null);
    setConversionMode("fixed");
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false);
    setIsSettingsDrawerDragging(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
  }

  function openSettingsDrawer() {
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(false);
    setSettingsDrawerDragOffset(0);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
    setIsSettingsDrawerOpen(true);
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    settingsDrawerClosingRef.current = true;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    setIsSettingsDrawerClosing(true);
    setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false);
      setIsSettingsDrawerClosing(false);
      setIsSettingsDrawerDragging(false);
      setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false;
      drawerDragOffsetRef.current = 0;
      window.requestAnimationFrame(() => mobileSettingsButtonRef.current?.focus());
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateSettingsDrawerDrag = useCallback((clientY: number) => {
    if (drawerDragStartYRef.current === null) return;
    const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
    drawerDragOffsetRef.current = dragDistance;
    setSettingsDrawerDragOffset(dragDistance);
  }, []);

  const finishSettingsDrawerDrag = useCallback((clientY?: number) => {
    if (drawerDragStartYRef.current === null) return;
    if (typeof clientY === "number") {
      const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
      drawerDragOffsetRef.current = dragDistance;
      setSettingsDrawerDragOffset(dragDistance);
    }
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    if (drawerDragOffsetRef.current >= 84) {
      closeSettingsDrawer();
      return;
    }
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }, [closeSettingsDrawer]);

  function beginDrawerHandleDrag(clientY: number) {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = clientY;
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
    setIsSettingsDrawerDragging(true);
  }

  function onDrawerHandlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawerHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    updateSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandlePointerEnd(event: PointerEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    beginDrawerHandleDrag(event.clientY);
  }

  function onDrawerHandleMouseUp(event: MouseEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.clientY);
  }

  function onDrawerHandleTouchStart(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) beginDrawerHandleDrag(touch.clientY);
  }

  function onDrawerHandleTouchMove(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    if (touch) updateSettingsDrawerDrag(touch.clientY);
  }

  function onDrawerHandleTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    finishSettingsDrawerDrag(event.changedTouches[0]?.clientY);
  }

  function clearDrawerHandleDrag() {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = null;
    setIsSettingsDrawerDragging(false);
    drawerDragOffsetRef.current = 0;
    setSettingsDrawerDragOffset(0);
  }

  function removeFile(indexToRemove: number) {
    clearResult();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus(files.length <= 1 ? "Upload a PDF file to convert into editable Word." : "PDF removed. Convert when ready.");
  }

  function selectFiles(nextFiles: File[]) {
    setError(null);
    clearResult();
    setProgress(0);

    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isPdf(nextFile))) {
      setError("Please upload a valid PDF file.");
      return;
    }

    setFiles((current) => [...current, ...nextFiles]);
    setWorkflowStep("arrange");
    setStatus("PDF loaded. Convert when ready.");
    scrollToolStageIntoView();
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function hasDraggedFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
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
    if (event.dataTransfer.files.length) {
      selectFiles(Array.from(event.dataTransfer.files));
    }
  }

  async function convertToWord() {
    if (files.length === 0) {
      setError("Please upload a PDF file first.");
      return;
    }

    clearResult();
    setError(null);
    setIsProcessing(true);
    setWorkflowStep("convert");
    setProgress(0);
    scrollToolStageIntoView();

    let ocrEngine: Awaited<ReturnType<typeof createLocalOcrEngine>> | undefined;
    let lowConfidenceWords = 0;
    let lowestQualityScore = 100;
    let hasQualityWarning = false;
    try {
      // The current product is browser-local. Official WPS cloud conversion is
      // deliberately unavailable until a licensed server adapter and explicit
      // remote-processing approval are configured.
      const engine = selectPdfToWordEngine();
      if (engine.engine !== "internal") throw new Error("The selected PDF-to-Word engine is not available in this client.");
      const pdfjsLib = await loadPdfJs();
      const convertedFiles: Array<{ fileName: string; blob: Blob }> = [];
      let totalPages = 0;
      let totalWords = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Reading ${currentFile.name}...`);
        const sourceBytes = new Uint8Array(await currentFile.arrayBuffer());
        const glyphResolver = conversionMode === "preserve" ? undefined : await createPdfGlyphUnicodeResolver(sourceBytes);
        const loadingTask = pdfjsLib.getDocument({ data: sourceBytes.slice(), fontExtraProperties: true });
        const pdf = await loadingTask.promise;
        const pages: ConvertedPage[] = [];
        let wordCount = 0;

        try {
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            setStatus(`${conversionMode === "preserve" ? "Rendering" : "Analyzing"} ${currentFile.name} page ${pageNumber} of ${pdf.numPages}...`);
            const page = await pdf.getPage(pageNumber);
            const [content, operators] = await Promise.all([page.getTextContent({ disableNormalization: true }), page.getOperatorList()]);
            const textItems = glyphResolver
              ? correctTextItemsFromGlyphStreams(
                content.items as PdfTextItem[],
                glyphResolver.pageStreams(pageNumber - 1, operators, pdfjsLib.OPS),
              )
              : content.items as PdfTextItem[];
            const viewport = page.getViewport({ scale: 1 });
            const analysis = analyzePdfPage(textItems, operators, pdfjsLib.OPS, viewport.width);
            let ocr: { result: LocalOcrResult; scale: number } | undefined;
            if (analysis.needsOcr && conversionMode !== "preserve") {
              setStatus(`OCR is required because page ${pageNumber} of ${pdf.numPages} is scanned.`);
              ocrEngine ??= await createLocalOcrEngine();
              ocr = await recognizeScannedPage(pdfjsLib, page, ocrEngine, (ocrProgress) => {
                const pageProgress = (pageNumber - 1 + ocrProgress * 0.8) / pdf.numPages;
                setProgress(Math.round(((fileIndex + pageProgress) / files.length) * 85));
              });
              lowConfidenceWords += ocr.result.lowConfidenceWords;
            }
            const convertedPage = await renderPdfPage(pdfjsLib, page, conversionMode, analysis, ocr, {
              items: textItems,
              styles: content.styles as Record<string, PdfTextStyle>,
            });
            pages.push(convertedPage);
            wordCount += convertedPage.lines
              .flatMap((line) => line.items.map((item) => item.text))
              .join(" ")
              .split(/\s+/)
              .filter(Boolean).length;
            setProgress(Math.round(((fileIndex + pageNumber / pdf.numPages) / files.length) * 85));
            if (pageNumber % analysis.batchSize === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }

          const quality = validateConvertedPages(pages, pdf.numPages, conversionMode !== "preserve");
          lowestQualityScore = Math.min(lowestQualityScore, quality.score);
          hasQualityWarning ||= quality.warning;

          setStatus(`Creating Word file for ${currentFile.name}...`);
          const blob = await finalizeDocx(createDocx(pages, currentFile.name, conversionMode), pages, conversionMode);
          convertedFiles.push({ fileName: `${cleanFileName(currentFile.name)}.docx`, blob });
          totalPages += pdf.numPages;
          totalWords += wordCount;
        } finally {
          pages.forEach((page) => page.image.fill(0));
          await loadingTask.destroy();
        }
      }

      setStatus("Preparing Word download...");
      let blob: Blob;

      if (convertedFiles.length === 1) {
        blob = convertedFiles[0].blob;
      } else {
        const zip = new JSZip();
        convertedFiles.forEach((item) => zip.file(item.fileName, item.blob));
        blob = await zip.generateAsync({ type: "blob" });
      }

      if (blob.size < 1024) throw new Error("The generated download is empty or incomplete.");

      const conversionWarning = lowConfidenceWords > 0
        ? `Some scanned text may require review (${lowConfidenceWords} low-confidence words; quality score ${lowestQualityScore}/100).`
        : hasQualityWarning
          ? `Fidelity warning: uncertain source text mapping was preserved visually instead of being replaced with guessed characters (quality score ${lowestQualityScore}/100).`
          : undefined;
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
        pageCount: totalPages,
        wordCount: totalWords,
        fileCount: convertedFiles.length,
        isZip: convertedFiles.length > 1,
        warning: conversionWarning,
      });
      setProgress(100);
      setStatus(conversionWarning
        ? conversionWarning
        : conversionMode === "fixed" ? "Original pages preserved with editable text."
          : conversionMode === "reflow" ? "Easy-editing Word document generated. Page breaks and spacing may change."
            : "Original page appearance preserved in Word.");
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this PDF to Word. Please try another file.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    } finally {
      await ocrEngine?.terminate();
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
    if (!isSettingsDrawerOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettingsDrawer();
    };
    const onResize = () => {
      if (window.innerWidth >= 1280) closeSettingsDrawer();
    };
    const onPointerMove = (event: globalThis.PointerEvent) => updateSettingsDrawerDrag(event.clientY);
    const onMouseMove = (event: globalThis.MouseEvent) => updateSettingsDrawerDrag(event.clientY);
    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (touch) updateSettingsDrawerDrag(touch.clientY);
    };
    const clearDrawerDrag = () => clearDrawerHandleDrag();
    const onPointerEnd = (event: globalThis.PointerEvent) => finishSettingsDrawerDrag(event.clientY);
    const onMouseEnd = (event: globalThis.MouseEvent) => finishSettingsDrawerDrag(event.clientY);
    const onTouchEnd = (event: globalThis.TouchEvent) => finishSettingsDrawerDrag(event.changedTouches[0]?.clientY);

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", clearDrawerDrag);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", clearDrawerDrag);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", clearDrawerDrag);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", clearDrawerDrag);
    };
  }, [isSettingsDrawerOpen, closeSettingsDrawer, finishSettingsDrawerDrag, updateSettingsDrawerDrag]);

  useEffect(() => {
    if (files.length === 0 || workflowStep !== "arrange") {
      setPreviewUrls([]);
      return;
    }

    let cancelled = false;
    const nextPreviewUrls: string[] = [];

    async function createPreviews() {
      const renderedUrls = await Promise.all(
        files.map(async (pdfFile) => {
          try {
            return await renderFirstPageThumbnail(pdfFile);
          } catch {
            return "";
          }
        }),
      );
      if (cancelled) {
        renderedUrls.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      nextPreviewUrls.push(...renderedUrls.filter(Boolean));
      setPreviewUrls(renderedUrls);
    }

    void createPreviews();
    return () => {
      cancelled = true;
      nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files, workflowStep]);

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
      const fallbackBarHeight = 96;
      const barHeight = actionBarRef.current?.offsetHeight ?? fallbackBarHeight;
      const workAreaInView = workAreaRect.bottom > 0 && workAreaRect.top < viewportHeight;
      const workspaceStillCoversBar = workspaceRect.bottom > viewportHeight - barHeight - 8;

      setIsActionBarVisible(window.innerWidth < 1280 ? workAreaInView : workAreaInView && workspaceStillCoversBar);
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
        htmlFor="pdf-word-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="pdf-word-upload" name="pdf-word-upload" ref={fileInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <FileType2 className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PDF</span>
        <span className="sr-only">Upload PDF files and convert readable content into Word.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PDF
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPdfCard(pdfFile: File, index: number) {
    const previewUrl = previewUrls[index];

    return (
      <article
        draggable
        onDragStart={() => setDraggedIndex(index)}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={() => reorderByDragEnter(index)}
        onDrop={() => setDraggedIndex(null)}
        onDragEnd={() => setDraggedIndex(null)}
        className="group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:border-red-200 hover:shadow-md active:cursor-grabbing"
      >
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">{index + 1}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeFile(index);
            }}
            className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]"
            aria-label={`Remove ${pdfFile.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-lg bg-white text-[#FF2D2D]">
              <FileText className="h-12 w-12" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="mt-2 min-w-0">
          <p className="truncate text-sm font-black leading-snug text-slate-950" title={pdfFile.name}>{compactFileName(pdfFile.name)}</p>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(pdfFile.size)} KB</span>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your PDF...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we create the Word file.</p>
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
    const downloadName = result?.isZip ? "PDFRoot-word-files.zip" : `${cleanFileName(files[0]?.name || "PDFRoot")}.docx`;

    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your Word file is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${result.sizeKb.toFixed(1)} KB - ${result.wordCount} words` : "Ready"}
          </p>
          {result?.warning && (
            <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold leading-6 text-amber-900">
              {result.warning}
            </p>
          )}
          {result && (
            <a href={result.url} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              {result.isZip ? "Download ZIP" : "Download DOCX"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Convert another PDF
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderMobileModeControls() {
    return (
      <fieldset className="grid w-full gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-700" aria-label="Word conversion mode">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200">
          <input
            type="radio"
            name="pdf-to-word-mode-mobile"
            value="fixed"
            checked={conversionMode === "fixed"}
            onChange={() => setConversionMode("fixed")}
            className="mt-0.5 accent-[#FF2D2D]"
          />
          <span><span className="block font-black text-slate-950">Keep Original Pages</span><span className="block font-bold text-slate-700">Best for minor editing</span><span className="block font-semibold text-slate-500">Preserves the original page layout while keeping text editable. Large text changes may affect the layout.</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200">
          <input
            type="radio"
            name="pdf-to-word-mode-mobile"
            value="reflow"
            checked={conversionMode === "reflow"}
            onChange={() => setConversionMode("reflow")}
            className="mt-0.5 accent-[#FF2D2D]"
          />
          <span><span className="block font-black text-slate-950">Easy Editing</span><span className="block font-bold text-slate-700">Best for major changes</span><span className="block font-semibold text-slate-500">Creates normal Word paragraphs, headings, tables, and page flow. Page breaks and spacing may differ from the PDF.</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200">
          <input
            type="radio"
            name="pdf-to-word-mode-mobile"
            value="preserve"
            checked={conversionMode === "preserve"}
            onChange={() => setConversionMode("preserve")}
            className="mt-0.5 accent-[#FF2D2D]"
          />
          <span><span className="block font-black text-slate-950">Preserve Exact Appearance</span><span className="block font-semibold text-slate-500">Preserves the original visual appearance. Page content may not be editable.</span></span>
        </label>
      </fieldset>
    );
  }

  function renderDesktopModeControls() {
    const modes: Array<{ value: ConversionMode; label: string; short: string; description: string }> = [
      { value: "fixed", label: "Keep Original Pages", short: "Minor editing", description: "Preserves the original page layout while keeping text editable. Large text changes may affect the layout." },
      { value: "reflow", label: "Easy Editing", short: "Major changes", description: "Creates normal Word paragraphs, headings, tables, and page flow. Page breaks and spacing may differ from the PDF." },
      { value: "preserve", label: "Preserve Exact Appearance", short: "Not editable", description: "Preserves the original visual appearance. Page content may not be editable." },
    ];

    return (
      <fieldset data-pdf-to-word-desktop-modes="true" className="flex min-w-0 items-center gap-1.5" aria-label="Word conversion mode">
        {modes.map((mode) => {
          const selected = conversionMode === mode.value;
          return (
            <label key={mode.value} title={mode.description} className={`flex h-12 w-[12.5rem] min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 transition ${selected ? "border-[#FF2D2D] bg-red-50 text-slate-950 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"}`}>
              <input type="radio" name="pdf-to-word-mode-desktop" value={mode.value} checked={selected} onChange={() => setConversionMode(mode.value)} className="sr-only" />
              <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${selected ? "border-[#FF2D2D]" : "border-slate-300"}`} aria-hidden="true">
                {selected && <span className="h-2 w-2 rounded-full bg-[#FF2D2D]" />}
              </span>
              <span className="min-w-0 leading-tight"><span className="block whitespace-nowrap text-[0.62rem] font-black tracking-tight">{mode.label}</span><span className="block whitespace-nowrap text-[0.62rem] font-bold text-slate-500">{mode.short}</span></span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className="relative min-h-[calc(100vh-9rem)] min-w-0 bg-slate-100 p-4 text-left sm:p-6">
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-44 sm:gap-5 xl:pb-28">
              {files.map((pdfFile, index) => (
                <div key={previewUrls[index] ?? `${pdfFile.name}-${pdfFile.size}-${pdfFile.lastModified}-${index}`}>{renderPdfCard(pdfFile, index)}</div>
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
      <div ref={actionBarRef} data-merge-action-bar="true" data-pdf-to-word-action-bar="true" className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 xl:pb-[calc(0.75rem+env(safe-area-inset-bottom))] xl:pt-3">
        <div className="mx-auto max-w-[1600px]">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(5.5rem,auto)] gap-1.5 xl:hidden">
              <button type="button" onClick={() => addMoreInputRef.current?.click()} aria-label="Add PDF files" className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition active:scale-95">
                <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-slate-950 px-1 text-[0.65rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
                <Plus className="h-6 w-6 stroke-[3]" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void convertToWord()} disabled={isProcessing} className="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-2 py-3 text-xs font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:gap-2 sm:px-3 sm:text-sm">
                {isProcessing ? "Converting..." : "Convert to Word"}
                <FileType2 className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetTool} className="inline-flex min-h-12 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2 py-3 text-[0.68rem] font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] active:scale-[0.98] sm:gap-1.5 sm:px-2.5 sm:text-xs">
                Clear all
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
          </div>

          <div className="hidden min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 xl:grid">
            <p className="truncate text-sm font-black text-slate-950">{readyLabel}</p>
            <div className="min-w-0">{renderDesktopModeControls()}</div>
            <div className="flex min-w-0 items-center">
              {error && <p className="max-w-sm truncate rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
            <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
              <button type="button" onClick={() => addMoreInputRef.current?.click()} aria-label="Add PDF files" className="relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14">
                <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span>
                <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void convertToWord()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
                {isProcessing ? "Converting..." : "Convert to Word"}
                <FileType2 className="h-5 w-5" aria-hidden="true" />
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

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;

    return (
      <div className="fixed inset-0 z-[60] xl:hidden">
        <style>{`
          @keyframes pdfToWordDrawerIn {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        <button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} aria-label="Close settings backdrop" onClick={closeSettingsDrawer} />
        <div
          id="pdf-to-word-mobile-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="PDF to Word settings"
          style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }}
          className={`absolute inset-x-0 bottom-0 flex max-h-[min(78vh,40rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${
            isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"
          } ${isSettingsDrawerClosing ? "" : "animate-[pdfToWordDrawerIn_220ms_ease-out]"} ${
            settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""
          }`}
        >
          <button
            type="button"
            className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing"
            aria-label="Drag down to close settings"
            onPointerDown={onDrawerHandlePointerDown}
            onPointerMove={onDrawerHandlePointerMove}
            onPointerUp={onDrawerHandlePointerEnd}
            onPointerCancel={clearDrawerHandleDrag}
            onLostPointerCapture={clearDrawerHandleDrag}
            onMouseDown={onDrawerHandleMouseDown}
            onMouseUp={onDrawerHandleMouseUp}
            onTouchStart={onDrawerHandleTouchStart}
            onTouchMove={onDrawerHandleTouchMove}
            onTouchEnd={onDrawerHandleTouchEnd}
            onTouchCancel={clearDrawerHandleDrag}
          >
            <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          </button>
          <div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5">
            <p className="text-sm font-black text-slate-950">Conversion Mode</p>
            <button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">
            {renderMobileModeControls()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="pdf-to-word-tool"
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onDrop}
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100 transition">
          <input id="pdf-word-workspace-upload" name="pdf-word-workspace-upload" ref={addMoreInputRef} className="sr-only" type="file" accept="application/pdf,.pdf" multiple onChange={onInputChange} />
          {renderWorkspace()}
          {workflowStep === "arrange" && (
            <button ref={mobileSettingsButtonRef} type="button" onClick={openSettingsDrawer} className={`fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[65] inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-md transition active:scale-95 xl:hidden ${isSettingsDrawerOpen ? "pointer-events-none opacity-0" : "opacity-100"}`} aria-expanded={isSettingsDrawerOpen} aria-controls="pdf-to-word-mobile-settings-drawer">
              <SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
              Settings
            </button>
          )}
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
