"use client";

import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, GripVertical, Loader2, PanelTop, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import JSZip from "jszip";

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
  slideCount: number;
  fileCount: number;
  isZip: boolean;
};

type SlideText = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bold: boolean;
  italic: boolean;
};

type SlideShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
};

type SlideImage = {
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
  format: "PNG" | "JPEG";
};

type SlideData = {
  title: string;
  texts: SlideText[];
  shapes: SlideShape[];
  images: SlideImage[];
};

type WorkflowStep = "arrange" | "convert" | "download";
type SlideScope = "all" | "odd" | "even";
type PageLayout = "original" | "a4";
type PageOrientation = "auto" | "landscape" | "portrait";

const EMU_PER_POINT = 12700;
const POWERPOINT_ACCEPT = ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPowerPointFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".pptx") || name.endsWith(".ppt") || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || file.type === "application/vnd.ms-powerpoint";
}

function cleanFileName(name: string) {
  return name.replace(/\.pptx?$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function textContent(element: Element, selector: string) {
  return element.querySelector(selector)?.textContent ?? "";
}

function attrNumber(element: Element | null, name: string, fallback = 0) {
  const value = element?.getAttribute(name);
  return value ? Number(value) || fallback : fallback;
}

function emuToPt(value: number, scale: number) {
  return (value / EMU_PER_POINT) * scale;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function escapeXmlName(name: string) {
  return name.replace(/^\//, "");
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read slide image."));
    reader.readAsDataURL(blob);
  });
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function slideSortKey(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

async function parseSlide(zip: JSZip, slidePath: string, pageScale: number): Promise<SlideData> {
  const xml = await zip.file(slidePath)?.async("string");
  if (!xml) {
    throw new Error(`Could not read ${slidePath}.`);
  }

  const doc = parseXml(xml);
  const relPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const relXml = await zip.file(relPath)?.async("string");
  const relDoc = relXml ? parseXml(relXml) : null;
  const rels = new Map<string, string>();

  relDoc?.querySelectorAll("Relationship").forEach((rel) => {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) {
      rels.set(id, target);
    }
  });

  const shapes: SlideShape[] = [];
  const texts: SlideText[] = [];
  const images: SlideImage[] = [];

  doc.querySelectorAll("p\\:sp, sp").forEach((shape) => {
    const off = shape.querySelector("a\\:off, off");
    const ext = shape.querySelector("a\\:ext, ext");
    const x = emuToPt(attrNumber(off, "x"), pageScale);
    const y = emuToPt(attrNumber(off, "y"), pageScale);
    const w = emuToPt(attrNumber(ext, "cx", 914400), pageScale);
    const h = emuToPt(attrNumber(ext, "cy", 457200), pageScale);
    const fillColor = shape.querySelector("a\\:solidFill a\\:srgbClr, solidFill srgbClr")?.getAttribute("val") ?? undefined;
    const paragraphs = Array.from(shape.querySelectorAll("a\\:p, p"));
    const textLines = paragraphs
      .map((paragraph) =>
        Array.from(paragraph.querySelectorAll("a\\:r, r"))
          .map((run) => textContent(run, "a\\:t, t"))
          .join(""),
      )
      .filter((line) => line.trim().length > 0);

    if (fillColor && !textLines.length) {
      shapes.push({ x, y, w, h, fill: fillColor });
    }

    if (textLines.length) {
      const runs = Array.from(shape.querySelectorAll("a\\:r, r"));
      const firstRunProps = runs[0]?.querySelector("a\\:rPr, rPr");
      texts.push({
        text: textLines.join("\n"),
        x,
        y,
        w,
        h,
        bold: firstRunProps?.getAttribute("b") === "1",
        italic: firstRunProps?.getAttribute("i") === "1",
      });
    }
  });

  for (const picture of Array.from(doc.querySelectorAll("p\\:pic, pic"))) {
    const off = picture.querySelector("a\\:off, off");
    const ext = picture.querySelector("a\\:ext, ext");
    const embedId = picture.querySelector("a\\:blip, blip")?.getAttribute("r:embed");
    const target = embedId ? rels.get(embedId) : null;

    if (!target) continue;

    const imagePath = escapeXmlName(target.startsWith("../") ? `ppt/${target.replace("../", "")}` : `ppt/slides/${target}`);
    const imageFile = zip.file(imagePath);
    if (!imageFile) continue;

    const lower = imagePath.toLowerCase();
    if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

    const blob = await imageFile.async("blob");
    images.push({
      x: emuToPt(attrNumber(off, "x"), pageScale),
      y: emuToPt(attrNumber(off, "y"), pageScale),
      w: emuToPt(attrNumber(ext, "cx", 914400), pageScale),
      h: emuToPt(attrNumber(ext, "cy", 457200), pageScale),
      dataUrl: await blobToDataUrl(blob),
      format: lower.endsWith(".png") ? "PNG" : "JPEG",
    });
  }

  return {
    title: texts[0]?.text.split("\n")[0] || slidePath.split("/").pop() || "Slide",
    texts,
    shapes,
    images,
  };
}

export function PowerPointToPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a PowerPoint file to convert into PDF.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [slideScope, setSlideScope] = useState<SlideScope>("all");
  const [pageLayout, setPageLayout] = useState<PageLayout>("original");
  const [pageOrientation, setPageOrientation] = useState<PageOrientation>("auto");
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<PdfResult | null>(null);
  const processingRef = useRef(false);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);
  const fileCount = files.length;
  const readyLabel = `${fileCount} ${fileCount === 1 ? "PowerPoint file" : "PowerPoint files"} ready`;

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById("powerpoint-to-pdf-tool");
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
    setStatus("Upload a PowerPoint file to convert into PDF.");
    setIsProcessing(false);
    setWorkflowStep("arrange");
    setDraggedIndex(null);
    setIsSettingsDrawerOpen(false);
    setIsSettingsDrawerClosing(false); setIsSettingsDrawerDragging(false); setSettingsDrawerDragOffset(0); settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0;
  }

  function removeFile(indexToRemove: number) {
    clearResult();
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    setError(null);
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus(files.length <= 1 ? "Upload a PowerPoint file to convert into PDF." : "PowerPoint file removed. Convert when ready.");
  }

  function selectFiles(nextFiles: File[]) {
    setError(null);
    clearResult();
    setProgress(0);

    if (nextFiles.length === 0) return;

    if (nextFiles.some((nextFile) => !isPowerPointFile(nextFile))) {
      setError("Please upload a valid PPT or PPTX PowerPoint file.");
      return;
    }

    setFiles((current) => [...current, ...nextFiles]);
    setWorkflowStep("arrange");
    setStatus("PowerPoint file loaded. Convert when ready.");
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
    if (processingRef.current || isProcessing) return;

    if (files.length === 0) {
      setError("Please upload a PowerPoint file first.");
      return;
    }

    const legacyFile = files.find((file) => file.name.toLowerCase().endsWith(".ppt"));
    if (legacyFile) {
      setError(`${legacyFile.name} is a legacy .ppt file. Please save it as .pptx and upload again.`);
      return;
    }

    clearResult();
    setError(null);
    processingRef.current = true;
    setIsProcessing(true);
    setIsSettingsDrawerOpen(false);
    setWorkflowStep("convert");
    setProgress(0);
    scrollToolStageIntoView();

    try {
      if (typeof window === "undefined") {
        throw new Error("PowerPoint conversion is available only in your browser.");
      }
      const { jsPDF } = await import("jspdf");
      const convertedFiles: Array<{ fileName: string; blob: Blob }> = [];
      let totalSlides = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const currentFile = files[fileIndex];
        setStatus(`Reading ${currentFile.name}...`);
        const zip = await JSZip.loadAsync(await currentFile.arrayBuffer());
        const allSlidePaths = Object.keys(zip.files)
          .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
          .sort((a, b) => slideSortKey(a) - slideSortKey(b));
        const slidePaths = allSlidePaths.filter((_, index) => slideScope === "all" || (slideScope === "odd" ? index % 2 === 0 : index % 2 === 1));

        if (!slidePaths.length) {
          throw new Error(`${currentFile.name} has no readable slides.`);
        }

        const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
        const presentationDoc = presentationXml ? parseXml(presentationXml) : null;
        const sldSz = presentationDoc?.querySelector("p\\:sldSz, sldSz");
        const slideWidthPt = attrNumber(sldSz ?? null, "cx", 12192000) / EMU_PER_POINT;
        const slideHeightPt = attrNumber(sldSz ?? null, "cy", 6858000) / EMU_PER_POINT;
        const orientation = pageOrientation === "auto" ? (slideWidthPt >= slideHeightPt ? "landscape" : "portrait") : pageOrientation;
        const originalLandscape = orientation === "landscape";
        const pageWidth = pageLayout === "a4" ? (originalLandscape ? 842 : 595) : (originalLandscape === (slideWidthPt >= slideHeightPt) ? slideWidthPt : slideHeightPt);
        const pageHeight = pageLayout === "a4" ? (originalLandscape ? 595 : 842) : (originalLandscape === (slideWidthPt >= slideHeightPt) ? slideHeightPt : slideWidthPt);
        const pdf = new jsPDF({
          unit: "pt",
          format: [pageWidth, pageHeight],
          orientation,
        });
        const pageScale = Math.min(pageWidth / slideWidthPt, pageHeight / slideHeightPt);

        for (let index = 0; index < slidePaths.length; index += 1) {
          if (index > 0) {
            pdf.addPage([pageWidth, pageHeight], orientation);
          }

          setStatus(`Converting ${currentFile.name} slide ${index + 1} of ${slidePaths.length}...`);
          const slide = await parseSlide(zip, slidePaths[index], pageScale);
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");

          slide.shapes.forEach((shape) => {
            if (shape.fill) {
              const color = hexToRgb(shape.fill);
              pdf.setFillColor(color.r, color.g, color.b);
              pdf.rect(shape.x, shape.y, shape.w, shape.h, "F");
            }
          });

          slide.images.forEach((image) => {
            try {
              pdf.addImage(image.dataUrl, image.format, image.x, image.y, image.w, image.h);
            } catch {
              // Some PowerPoint image formats may not be supported by jsPDF.
            }
          });

          slide.texts.forEach((textBox, textIndex) => {
            const isTitle = textIndex === 0 || textBox.h > 300000 / EMU_PER_POINT;
            const fontSize = isTitle ? 24 : 13;
            const style = textBox.bold && textBox.italic ? "bolditalic" : textBox.bold ? "bold" : textBox.italic ? "italic" : "normal";
            pdf.setFont("helvetica", style);
            pdf.setFontSize(fontSize);
            pdf.setTextColor(15, 23, 42);
            const lines = pdf.splitTextToSize(textBox.text, Math.max(40, textBox.w)) as string[];
            pdf.text(lines, textBox.x, textBox.y + fontSize, { maxWidth: Math.max(40, textBox.w) });
          });

          setProgress(Math.round(((fileIndex + (index + 1) / slidePaths.length) / files.length) * 85));
        }

        setStatus(`Creating PDF file for ${currentFile.name}...`);
        const blob = pdf.output("blob");
        convertedFiles.push({ fileName: `${cleanFileName(currentFile.name)}.pdf`, blob });
        totalSlides += slidePaths.length;
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
        slideCount: totalSlides,
        fileCount: convertedFiles.length,
        isZip: convertedFiles.length > 1,
      });
      setProgress(100);
      setStatus("PowerPoint converted to PDF. Slide layout is preserved as much as possible.");
      setWorkflowStep("download");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(/loading chunk|chunkloaderror/i.test(message) ? "The PDF converter could not be loaded. Please refresh the page and try again." : message || "Could not convert this PowerPoint file to PDF. Please try another PPTX file.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    } finally {
      processingRef.current = false;
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

  function openSettingsDrawer() {
    if (window.innerWidth < 640 && workAreaRef.current) { const y = workAreaRef.current.getBoundingClientRect().top + window.scrollY - 12; window.scrollTo({ top: Math.max(0, y), behavior: "auto" }); }
    setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerOpen(true);
    settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0;
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const distance = Math.max(window.innerHeight, 420); settingsDrawerClosingRef.current = true; drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(true); setSettingsDrawerDragOffset(distance); drawerDragOffsetRef.current = distance;
    window.setTimeout(() => { setIsSettingsDrawerOpen(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerDragging(false); setSettingsDrawerDragOffset(0); settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0; window.requestAnimationFrame(() => mobileSettingsButtonRef.current?.focus()); }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateDrawerDrag = useCallback((clientY: number) => { if (drawerDragStartYRef.current !== null) { const distance = Math.max(0, clientY - drawerDragStartYRef.current); drawerDragOffsetRef.current = distance; setSettingsDrawerDragOffset(distance); } }, []);
  const finishDrawerDrag = useCallback((clientY?: number) => { if (drawerDragStartYRef.current === null) return; if (typeof clientY === "number") { const distance = Math.max(0, clientY - drawerDragStartYRef.current); drawerDragOffsetRef.current = distance; setSettingsDrawerDragOffset(distance); } drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); if (drawerDragOffsetRef.current >= 84) return closeSettingsDrawer(); drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); }, [closeSettingsDrawer]);
  function beginDrawerDrag(clientY: number) { if (!settingsDrawerClosingRef.current) { drawerDragStartYRef.current = clientY; drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(true); } }
  function clearDrawerDrag() { if (!settingsDrawerClosingRef.current) { drawerDragStartYRef.current = null; drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); } }

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const resize = () => { if (innerWidth >= 640) closeSettingsDrawer(); };
    const pointerMove = (event: globalThis.PointerEvent) => updateDrawerDrag(event.clientY); const mouseMove = (event: globalThis.MouseEvent) => updateDrawerDrag(event.clientY); const touchMove = (event: globalThis.TouchEvent) => { if (event.touches[0]) updateDrawerDrag(event.touches[0].clientY); };
    const pointerEnd = (event: globalThis.PointerEvent) => finishDrawerDrag(event.clientY); const mouseEnd = (event: globalThis.MouseEvent) => finishDrawerDrag(event.clientY); const touchEnd = (event: globalThis.TouchEvent) => finishDrawerDrag(event.changedTouches[0]?.clientY);
    document.addEventListener("keydown", key); window.addEventListener("resize", resize); window.addEventListener("pointermove", pointerMove); window.addEventListener("pointerup", pointerEnd); window.addEventListener("pointercancel", clearDrawerDrag); window.addEventListener("mousemove", mouseMove); window.addEventListener("mouseup", mouseEnd); window.addEventListener("touchmove", touchMove, { passive: true }); window.addEventListener("touchend", touchEnd); window.addEventListener("touchcancel", clearDrawerDrag);
    return () => { document.removeEventListener("keydown", key); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerEnd); window.removeEventListener("pointercancel", clearDrawerDrag); window.removeEventListener("mousemove", mouseMove); window.removeEventListener("mouseup", mouseEnd); window.removeEventListener("touchmove", touchMove); window.removeEventListener("touchend", touchEnd); window.removeEventListener("touchcancel", clearDrawerDrag); };
  }, [closeSettingsDrawer, finishDrawerDrag, isSettingsDrawerOpen, updateDrawerDrag]);

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

      setIsActionBarVisible(window.innerWidth < 640 ? workAreaInView : workAreaInView && workspaceStillCoversBar);
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
        htmlFor="powerpoint-pdf-upload"
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
        <input id="powerpoint-pdf-upload" name="powerpoint-pdf-upload" ref={fileInputRef} className="sr-only" type="file" accept={POWERPOINT_ACCEPT} multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <PanelTop className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop PowerPoint</span>
        <span className="sr-only">Upload PowerPoint files and convert slides into PDF.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose PowerPoint
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderPowerPointCard(powerPointFile: File, index: number) {
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
          <button type="button" onClick={(event) => { event.stopPropagation(); removeFile(index); }} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${powerPointFile.name}`}><Trash2 className="h-4 w-4" /></button>
          <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm"><GripVertical className="h-4 w-4" /></span>
          <div className="grid h-full w-full place-items-center bg-red-50 text-[#FF2D2D]">
            <PanelTop className="h-16 w-16" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-snug text-slate-950" title={powerPointFile.name}>{powerPointFile.name}</p>
            <p className="mt-1.5 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(powerPointFile.size)} KB</p>
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
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your PowerPoint...</h3>
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
            {result ? `${result.fileCount} ${result.fileCount === 1 ? "file" : "files"} - ${result.sizeKb.toFixed(1)} KB - ${result.slideCount} slides` : "Ready"}
          </p>
          {result && (
            <a href={result.url} download={downloadName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
              {result.isZip ? "Download ZIP" : "Download PDF"}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
            Convert another PowerPoint
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderSettings(desktop = false) {
    const groups = [
      { label: "Slides", value: slideScope, set: (v: string) => setSlideScope(v as SlideScope), options: [["all", "All"], ["odd", "Odd"], ["even", "Even"]] },
      { label: "Page", value: pageLayout, set: (v: string) => setPageLayout(v as PageLayout), options: [["original", "Original"], ["a4", "A4"]] },
      { label: "Orientation", value: pageOrientation, set: (v: string) => setPageOrientation(v as PageOrientation), options: [["auto", "Auto"], ["landscape", "Landscape"], ["portrait", "Portrait"]] },
    ];
    if (desktop) return <div className="flex min-w-max flex-nowrap items-end gap-2 pb-1">{groups.map((group) => <label key={group.label} className="w-[7rem] shrink-0"><span className="mb-1 block text-[0.62rem] font-black uppercase tracking-wide text-slate-500">{group.label}</span><select value={group.value} onChange={(event) => group.set(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 outline-none focus:border-[#FF2D2D]">{group.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div>;
    return <div className="grid gap-3">{groups.map((group) => <fieldset key={group.label}><legend className="mb-1 text-[0.68rem] font-black uppercase tracking-wide text-slate-500">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.options.map(([value, label]) => <button key={value} type="button" onClick={() => group.set(value)} className={`h-9 rounded-lg border px-2.5 text-xs font-black ${group.value === value ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-200 bg-white text-slate-700"}`}>{label}</button>)}</div></fieldset>)}</div>;
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className={`relative min-w-0 bg-slate-100 p-4 text-left sm:p-6 ${workflowStep === "download" ? "min-h-0" : "min-h-[calc(100dvh-9rem)]"}`}>
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className="grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 pb-[28rem] sm:gap-5 sm:pb-56 lg:pb-40 xl:pb-28">
              {files.map((powerPointFile, index) => (
                <div key={`${powerPointFile.name}-${powerPointFile.size}-${powerPointFile.lastModified}-${index}`}>{renderPowerPointCard(powerPointFile, index)}</div>
              ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderActionButtons() {
    return <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]"><label htmlFor="powerpoint-pdf-workspace-upload" aria-label="Add PowerPoint files" className="relative inline-grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:h-14 sm:w-14"><span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">{fileCount}</span><Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" /></label><button type="button" onClick={() => void convertToPdf()} disabled={isProcessing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">{isProcessing ? "Converting..." : "Convert to PDF"}<FileText className="h-5 w-5" aria-hidden="true" /></button><button type="button" onClick={resetTool} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">Clear all<RotateCcw className="h-5 w-5" aria-hidden="true" /></button></div>;
  }

  function renderBottomActionBar() {
    return (
      <div ref={actionBarRef} data-merge-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:self-center"><p className="truncate text-sm font-black text-slate-950">{readyLabel}</p><button ref={mobileSettingsButtonRef} type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black sm:hidden" aria-controls="powerpoint-to-pdf-mobile-settings-drawer" aria-expanded={isSettingsDrawerOpen}><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button></div>
          <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain sm:block">{renderSettings(true)}</div>
          <div className="min-w-0 sm:ml-auto">
            {renderActionButtons()}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;
    return <div className="fixed inset-0 z-[60] sm:hidden"><style>{`@keyframes pptDrawerIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style><button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} onClick={closeSettingsDrawer} aria-label="Close settings backdrop" /><div id="powerpoint-to-pdf-mobile-settings-drawer" role="dialog" aria-modal="true" aria-label="PowerPoint to PDF settings" style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[min(44vh,23rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[pptDrawerIn_220ms_ease-out]"} ${settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""}`}><button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing" aria-label="Drag down to close settings" onPointerDown={(event: PointerEvent<HTMLButtonElement>) => { beginDrawerDrag(event.clientY); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event: PointerEvent<HTMLButtonElement>) => updateDrawerDrag(event.clientY)} onPointerUp={(event: PointerEvent<HTMLButtonElement>) => finishDrawerDrag(event.clientY)} onPointerCancel={clearDrawerDrag} onLostPointerCapture={clearDrawerDrag} onMouseDown={(event: MouseEvent<HTMLButtonElement>) => beginDrawerDrag(event.clientY)} onMouseUp={(event: MouseEvent<HTMLButtonElement>) => finishDrawerDrag(event.clientY)} onTouchStart={(event: TouchEvent<HTMLButtonElement>) => event.touches[0] && beginDrawerDrag(event.touches[0].clientY)} onTouchMove={(event: TouchEvent<HTMLButtonElement>) => event.touches[0] && updateDrawerDrag(event.touches[0].clientY)} onTouchEnd={(event: TouchEvent<HTMLButtonElement>) => finishDrawerDrag(event.changedTouches[0]?.clientY)} onTouchCancel={clearDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" /></button><div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black text-slate-950">PDF settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderSettings()}</div><div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{renderActionButtons()}</div></div></div>;
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={files.length > 0 ? "true" : undefined}
      id="powerpoint-to-pdf-tool"
      className={`mx-auto mt-6 max-w-full text-left ${
        files.length > 0 ? "w-full scroll-mt-32 border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {files.length > 0 ? (
        <div ref={workspaceRef} className="relative min-w-0 overflow-visible bg-slate-100">
          <input id="powerpoint-pdf-workspace-upload" name="powerpoint-pdf-workspace-upload" ref={fileInputRef} className="sr-only" type="file" accept={POWERPOINT_ACCEPT} multiple onChange={onInputChange} />
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
