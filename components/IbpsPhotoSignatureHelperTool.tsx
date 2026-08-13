"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileImage, Fingerprint, GripVertical, ImageUp, PenLine, Plus, RefreshCw, RotateCcw, ScrollText, Trash2, UploadCloud } from "lucide-react";
import { compressCanvasToExactKb } from "@/lib/exactKbImage";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";
import styles from "./IbpsPhotoSignatureHelperTool.module.css";

type Stage = "upload" | "workspace" | "processing" | "success";
type DocumentType = "photo" | "signature" | "thumb" | "declaration";

type IbpsConfig = {
  id: DocumentType;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  minKb: number;
  maxKb: number;
  targetKb: number;
  dpi?: number;
  hint: string;
  actionLabel: string;
  successTitle: string;
  infoText: string;
  downloadLabel: string;
};

type SelectedDocument = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type OutputDocument = {
  blob: Blob;
  url: string;
  fileName: string;
  width: number;
  height: number;
  sizeKb: number;
};

const IBPS_CONFIGS: Record<DocumentType, IbpsConfig> = {
  photo: {
    id: "photo",
    label: "Photograph",
    shortLabel: "Photo",
    width: 200,
    height: 230,
    minKb: 20,
    maxKb: 50,
    targetKb: 35,
    hint: "Recent passport style colour photo, light or white background, face clearly visible",
    actionLabel: "Resize Photo for IBPS",
    successTitle: "IBPS Photo Ready",
    infoText: "JPG/JPEG • 200 × 230 px • 20–50 KB",
    downloadLabel: "Download IBPS Photo",
  },
  signature: {
    id: "signature",
    label: "Signature",
    shortLabel: "Signature",
    width: 140,
    height: 60,
    minKb: 10,
    maxKb: 20,
    targetKb: 15,
    hint: "Black ink on white paper, not in capital letters, clearly visible and not smudged",
    actionLabel: "Resize Signature for IBPS",
    successTitle: "IBPS Signature Ready",
    infoText: "JPG/JPEG • 140 × 60 px • 10–20 KB",
    downloadLabel: "Download IBPS Signature",
  },
  thumb: {
    id: "thumb",
    label: "Left Thumb Impression",
    shortLabel: "Thumb",
    width: 240,
    height: 240,
    minKb: 20,
    maxKb: 50,
    targetKb: 35,
    dpi: 200,
    hint: "Black or blue ink on white paper, clear and not smudged",
    actionLabel: "Resize Thumb for IBPS",
    successTitle: "IBPS Thumb Impression Ready",
    infoText: "JPG/JPEG • 240 × 240 px • 20–50 KB • 200 DPI",
    downloadLabel: "Download IBPS Thumb Impression",
  },
  declaration: {
    id: "declaration",
    label: "Handwritten Declaration",
    shortLabel: "Declaration",
    width: 800,
    height: 400,
    minKb: 50,
    maxKb: 100,
    targetKb: 75,
    dpi: 200,
    hint: "Written in English only, black ink on white paper, not in capital letters, clearly readable",
    actionLabel: "Resize Declaration for IBPS",
    successTitle: "IBPS Declaration Ready",
    infoText: "JPG/JPEG • 800 × 400 px • 50–100 KB • 200 DPI",
    downloadLabel: "Download IBPS Declaration",
  },
};

const DOCUMENT_ORDER: DocumentType[] = ["photo", "signature", "thumb", "declaration"];
const IBPS_ORIGINAL_PAGE_HEADING = "IBPS Photo, Signature, Thumb & Declaration Resize Online";
const IBPS_PAGE_HEADING = "IBPS Photo & Signature Resizer";
const IBPS_SUPPORTING_TEXT = "Resize IBPS photo, signature, thumb impression and handwritten declaration to the required size online.";

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function cleanFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "") || "ibps-document";
}

function splitFileName(fileName: string) {
  const match = fileName.match(/^(.*?)(\.[^.]+)$/);
  if (!match) return { stem: fileName, extension: "" };
  return { stem: match[1] || fileName, extension: match[2] };
}

function isSupportedImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this document image. Please upload JPG, JPEG, PNG, or WEBP."));
    };
    image.src = url;
  });
}

function drawDocumentToCanvas(image: HTMLImageElement, config: IbpsConfig) {
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = config.width / config.height;
  let drawWidth = config.width;
  let drawHeight = config.height;
  let drawX = 0;
  let drawY = 0;

  if (sourceRatio > targetRatio) {
    drawHeight = Math.round(config.width / sourceRatio);
    drawY = Math.round((config.height - drawHeight) / 2);
  } else {
    drawWidth = Math.round(config.height * sourceRatio);
    drawX = Math.round((config.width - drawWidth) / 2);
  }

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

async function applyJpegDpi(blob: Blob, dpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  const densityHigh = (density >> 8) & 255;
  const densityLow = density & 255;

  for (let index = 2; index < bytes.length - 17; ) {
    if (bytes[index] !== 255) break;
    const marker = bytes[index + 1];
    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    if (marker === 224 && bytes[index + 4] === 0x4a && bytes[index + 5] === 0x46 && bytes[index + 6] === 0x49 && bytes[index + 7] === 0x46 && bytes[index + 8] === 0) {
      bytes[index + 11] = 1;
      bytes[index + 12] = densityHigh;
      bytes[index + 13] = densityLow;
      bytes[index + 14] = densityHigh;
      bytes[index + 15] = densityLow;
      return new Blob([bytes], { type: "image/jpeg" });
    }
    if (length < 2) break;
    index += 2 + length;
  }

  return blob;
}

async function resizeForIbps(document: SelectedDocument, config: IbpsConfig) {
  const image = await loadImage(document.file);
  const canvas = drawDocumentToCanvas(image, config);
  const result = await compressCanvasToExactKb(canvas, config.targetKb, {
    allowDimensionGrowth: false,
    allowDimensionShrink: false,
    marker: "\nPDFRoot_IBPS_DOCUMENT_PADDING\n",
    mimeType: "image/jpeg",
  });
  const blob = config.dpi ? await applyJpegDpi(result.blob, config.dpi) : result.blob;
  const baseName = cleanFileName(document.file.name);

  return {
    blob,
    url: URL.createObjectURL(blob),
    fileName: `${baseName}-ibps-${config.id}.jpg`,
    width: result.width,
    height: result.height,
    sizeKb: blob.size / 1024,
  };
}

function DocumentIcon({ type }: { type: DocumentType }) {
  const className = "h-5 w-5";
  if (type === "signature") return <PenLine className={className} aria-hidden="true" />;
  if (type === "thumb") return <Fingerprint className={className} aria-hidden="true" />;
  if (type === "declaration") return <ScrollText className={className} aria-hidden="true" />;
  return <FileImage className={className} aria-hidden="true" />;
}

export function IbpsPhotoSignatureHelperTool() {
  const [stage, setStage] = useState<Stage>("upload");
  const [selectedType, setSelectedType] = useState<DocumentType>("photo");
  const [document, setDocument] = useState<SelectedDocument | null>(null);
  const [output, setOutput] = useState<OutputDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConstrainedWorkspace, setIsConstrainedWorkspace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const toolSectionRef = useRef<HTMLElement | null>(null);
  const processingSectionRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const shouldScrollToUploadRef = useRef(false);
  const documentRef = useRef<SelectedDocument | null>(null);
  const outputRef = useRef<OutputDocument | null>(null);

  const config = IBPS_CONFIGS[selectedType];

  function clearNativeInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }

  function revokeDocument(current = document) {
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
  }

  function revokeOutput(current = output) {
    if (current?.url) URL.revokeObjectURL(current.url);
  }

  function clearOutput() {
    revokeOutput();
    setOutput(null);
  }

  function resetTool() {
    revokeDocument();
    revokeOutput();
    setStage("upload");
    setDocument(null);
    setOutput(null);
    setError(null);
    setIsDragging(false);
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  function selectType(type: DocumentType) {
    if (type === selectedType) return;

    if (stage !== "workspace") resetTool();
    setSelectedType(type);
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    clearOutput();
    if (!file) return;

    if (!isSupportedImage(file)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP document images.");
      return;
    }

    const isWorkspaceReplacement = Boolean(document);
    if (!isWorkspaceReplacement) setStage("processing");
    clearNativeInputs();

    try {
      const image = await loadImage(file);
      revokeDocument();
      setDocument({
        id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setStage("workspace");
      if (!isWorkspaceReplacement) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      }
    } catch (err) {
      setStage(document ? "workspace" : "upload");
      setError(err instanceof Error ? err.message : "Could not read this document. Please try another image.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
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

  function onUploadDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function removeDocument() {
    revokeDocument();
    clearOutput();
    setDocument(null);
    setError(null);
    setStage("upload");
    clearNativeInputs();
    shouldScrollToUploadRef.current = true;
  }

  async function processDocument() {
    if (!document) {
      setError("Please upload an IBPS document first.");
      setStage("upload");
      return;
    }

    clearOutput();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStage("processing");
    setError(null);

    try {
      const result = await resizeForIbps(document, config);
      setOutput(result);
      setStage("success");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resize this IBPS document.");
      setStage("workspace");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length) void handleFile(files[0]);
    });
    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    const heading = page?.querySelector<HTMLHeadingElement>("h1");
    const hero = page?.querySelector<HTMLElement>("[data-tool-workspace-hero]");
    if (!heading || !hero || heading.textContent?.trim() !== IBPS_ORIGINAL_PAGE_HEADING) return;

    heading.textContent = IBPS_PAGE_HEADING;
    heading.classList.add("ibps-page-heading");
    hero.classList.add("ibps-page-hero");
    const supportingText = globalThis.document.createElement("p");
    supportingText.className = styles.supportingText;
    supportingText.textContent = IBPS_SUPPORTING_TEXT;
    heading.insertAdjacentElement("afterend", supportingText);

    return () => {
      heading.textContent = IBPS_ORIGINAL_PAGE_HEADING;
      heading.classList.remove("ibps-page-heading");
      hero.classList.remove("ibps-page-hero");
      supportingText.remove();
    };
  }, []);

  useEffect(() => {
    if (stage !== "processing") return;
    window.requestAnimationFrame(() => {
      const processingSection = processingSectionRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [stage]);

  useLayoutEffect(() => {
    if (!document || stage !== "workspace") return;

    const workspaceSection = toolSectionRef.current;
    const previewWorkspace = workAreaRef.current;
    const actionBar = actionBarRef.current;
    if (!workspaceSection || !previewWorkspace || !actionBar) return;

    let frame = 0;

    const updateWorkspaceHeight = () => {
      const previewPaddingTop = Number.parseFloat(window.getComputedStyle(previewWorkspace).paddingTop) || 0;
      const previewGrid = previewWorkspace.querySelector<HTMLElement>("[data-ibps-document-preview-grid='true']");
      const requiredPreviewHeight = previewGrid?.scrollHeight ?? 0;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const workspaceTop = workspaceSection.getBoundingClientRect().top + window.scrollY;
      const availableHeight = Math.max(0, viewportHeight - workspaceTop - actionBar.offsetHeight);

      previewWorkspace.style.setProperty("--ibps-preview-padding", `${previewPaddingTop}px`);
      workspaceSection.style.setProperty("--ibps-workspace-height", `${availableHeight}px`);
      setIsConstrainedWorkspace(requiredPreviewHeight > availableHeight + 1);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateWorkspaceHeight);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(actionBar);
    const previewGrid = previewWorkspace.querySelector<HTMLElement>("[data-ibps-document-preview-grid='true']");
    if (previewGrid) resizeObserver.observe(previewGrid);
    resizeObserver.observe(workspaceSection.closest<HTMLElement>("[data-tool-workspace-hero]") ?? workspaceSection);
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      workspaceSection.style.removeProperty("--ibps-workspace-height");
      previewWorkspace.style.removeProperty("--ibps-preview-padding");
    };
  }, [document, selectedType, stage]);

  useEffect(() => {
    if (stage !== "upload" || !shouldScrollToUploadRef.current) return;
    shouldScrollToUploadRef.current = false;
    window.requestAnimationFrame(() => {
      const uploadSection = toolSectionRef.current;
      if (!uploadSection) return;
      const pageHero = uploadSection.parentElement?.closest<HTMLElement>("section");
      const target = pageHero ?? uploadSection;
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [stage]);

  useEffect(() => {
    const page = toolSectionRef.current?.closest<HTMLElement>(".v0-tool-page");
    if (!page) return;

    if (stage === "workspace") {
      page.dataset.ibpsDocumentActiveWorkspace = "true";
    } else {
      delete page.dataset.ibpsDocumentActiveWorkspace;
    }

    return () => {
      delete page.dataset.ibpsDocumentActiveWorkspace;
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "success" || !output) return;

    const heroSection = toolSectionRef.current?.parentElement?.closest("section");
    if (!(heroSection instanceof HTMLElement)) return;

    const hadHeroBorder = heroSection.classList.contains("border-b");
    const hadHeroBorderColor = heroSection.classList.contains("border-border");
    const heroPaddingBottom = heroSection.style.paddingBottom;
    heroSection.classList.remove("border-b", "border-border");
    heroSection.style.paddingBottom = "26px";

    return () => {
      if (hadHeroBorder) heroSection.classList.add("border-b");
      if (hadHeroBorderColor) heroSection.classList.add("border-border");
      heroSection.style.paddingBottom = heroPaddingBottom;
    };
  }, [output, stage]);

  useEffect(() => {
    const toolSection = toolSectionRef.current;
    if (!toolSection || stage !== "processing") return;

    const hiddenElements: Array<{ element: HTMLElement; display: string }> = [];
    const hideElement = (element: Element | null) => {
      if (!(element instanceof HTMLElement) || element === toolSection) return;
      hiddenElements.push({ element, display: element.style.display });
      element.style.display = "none";
    };

    const toolShell = toolSection.parentElement;
    if (toolShell) {
      Array.from(toolShell.children).forEach((child) => {
        if (child !== toolSection) hideElement(child);
      });
    }

    const heroSection = toolSection.parentElement?.closest("section");
    let sibling = heroSection?.nextElementSibling ?? null;
    while (sibling) {
      hideElement(sibling);
      sibling = sibling.nextElementSibling;
    }

    return () => {
      hiddenElements.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }, [stage]);

  useEffect(() => {
    return () => {
      if (documentRef.current?.previewUrl) URL.revokeObjectURL(documentRef.current.previewUrl);
      if (outputRef.current?.url) URL.revokeObjectURL(outputRef.current.url);
    };
  }, []);

  function renderLocalPageStyles() {
    return (
      <style>{`
        .ibps-page-hero .ibps-page-heading {
          position: relative;
          left: 50%;
          width: min(92vw, 68rem) !important;
          max-width: 68rem !important;
          margin-inline: 0 !important;
          font-size: clamp(2rem, 4vw, 4rem) !important;
          line-height: 1.02 !important;
          text-wrap: wrap !important;
          transform: translateX(-50%);
        }

        @media (min-width: 1024px) {
          .ibps-page-hero .ibps-page-heading {
            white-space: nowrap;
          }
        }

        .ibps-page-hero {
          padding-top: clamp(1.5rem, 4svh, 3rem) !important;
          padding-bottom: clamp(1rem, 2.5svh, 2rem) !important;
        }

        @media (max-width: 767px) {
          .ibps-page-hero .ibps-page-heading {
            line-height: 1 !important;
          }
        }

      `}</style>
    );
  }

  function renderTypeSelector(placement: "top" | "sticky" = "top") {
    const isSticky = placement === "sticky";
    return (
      <div
        data-ibps-option-list={placement}
        role={isSticky ? "toolbar" : "tablist"}
        aria-label="IBPS document type"
        className={
          isSticky
            ? "flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        {DOCUMENT_ORDER.map((type) => {
          const item = IBPS_CONFIGS[type];
          const isSelected = selectedType === type;
          return (
            <button
              key={type}
              id={`ibps-${placement}-option-${type}`}
              data-ibps-sticky-option={isSticky ? type : undefined}
              type="button"
              role={isSticky ? undefined : "tab"}
              aria-selected={isSticky ? undefined : isSelected}
              aria-pressed={isSticky ? isSelected : undefined}
              aria-controls={isSticky ? undefined : "ibps-selected-option-panel"}
              onClick={() => selectType(type)}
              className={`flex shrink-0 items-center text-left transition ${
                isSticky ? "min-h-14 min-w-[9.5rem] gap-2 rounded-xl border px-3 py-2" : "min-h-20 gap-3 rounded-2xl border px-4 py-3"
              } ${
                isSelected ? "border-[#FF2D2D] bg-red-50 text-slate-950 ring-4 ring-red-100" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50"
              }`}
            >
              <span className={`grid shrink-0 place-items-center rounded-xl ${isSticky ? "h-10 w-10" : "h-11 w-11"} ${isSelected ? "bg-[#FF2D2D] text-white" : "bg-slate-100 text-slate-600"}`}>
                <DocumentIcon type={type} />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-sm font-black">{item.shortLabel}</span>
                <span className="mt-0.5 block whitespace-nowrap text-[0.7rem] font-bold text-slate-500">{item.width} × {item.height}px</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderUploadBox() {
    return (
      <label
        id="ibps-selected-option-panel"
        role="tabpanel"
        aria-labelledby={`ibps-top-option-${selectedType}`}
        data-primary-upload="true"
        htmlFor="ibps-document-upload"
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onUploadDrop}
        className={`group mt-5 flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
        }`}
      >
        <input id="ibps-document-upload" name="ibps-document-upload" ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Upload IBPS {config.label}</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          Choose {config.shortLabel}
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddButton() {
    return (
      <button type="button" aria-label={`Add ${config.label}`} title={`Add ${config.label}`} onClick={() => addMoreInputRef.current?.click()} className="relative order-3 inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:order-none sm:h-14 sm:w-14">
        <span className="absolute left-0 top-0 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white sm:-left-1 sm:-top-1">1</span>
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </button>
    );
  }

  function renderActionButtons() {
    return (
      <div className="grid grid-cols-[minmax(6.5rem,1fr)_minmax(4.75rem,0.75fr)_3rem] gap-2 pl-10 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] sm:pl-0 lg:w-auto lg:min-w-[30rem]">
        {renderAddButton()}
        <button type="button" onClick={() => void processDocument()} className="order-1 inline-flex min-h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-2 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 sm:order-none sm:min-h-14 sm:gap-2 sm:px-5 sm:text-base">
          <span className="sm:hidden">Resize Now</span>
          <span className="hidden sm:inline">{config.actionLabel}</span>
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={resetTool} className="order-2 inline-flex min-h-12 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-1.5 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:order-none sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
          Clear all
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <section
        ref={(node) => {
          toolSectionRef.current = node;
          processingSectionRef.current = node;
        }}
        data-v0-managed-flow="true"
        id="ibps-document-resize-tool"
        className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
      >
        {renderLocalPageStyles()}
        <div>
          <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
          <p className="mt-4 text-base font-black text-slate-950">Resizing IBPS {config.shortLabel.toLowerCase()}...</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">Preparing JPG/JPEG at {config.width} × {config.height}px and {config.minKb}–{config.maxKb} KB</p>
        </div>
      </section>
    );
  }

  if (stage === "success" && output) {
    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-crop-image-workspace="true" id="ibps-document-resize-tool" className="mx-auto mt-3 w-full max-w-full overflow-visible bg-transparent p-0 text-left">
        {renderLocalPageStyles()}
        <div className="relative min-w-0 overflow-visible bg-slate-100">
          <div data-crop-image-preview-area="true" data-v0-result-screen="true" data-workflow-step="download" className="relative min-w-0 bg-slate-100 p-4 text-left sm:p-6">
            <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{config.successTitle}</h3>
                <p className="mt-2 text-sm font-semibold text-slate-500">{config.infoText}</p>
                <a href={output.url} download={output.fileName} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  {config.downloadLabel}
                  <Download className="h-5 w-5" aria-hidden="true" />
                </a>
                <button type="button" onClick={resetTool} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">
                  Resize Another IBPS Document
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stage === "workspace" && document) {
    const displayName = splitFileName(document.file.name);

    return (
      <section ref={toolSectionRef} data-v0-managed-flow="true" data-ibps-document-workspace="true" data-ibps-helper-workspace="true" id="ibps-document-resize-tool" onDragOver={onFileDragOver} onDragLeave={onFileDragLeave} onDrop={onUploadDrop} className={`mx-auto mt-6 w-full max-w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 text-left shadow-none ${styles.workspaceSection} ${isConstrainedWorkspace ? styles.constrainedWorkspaceSection : ""}`}>
        {renderLocalPageStyles()}
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${styles.workspaceShell} ${isDragging ? "ring-4 ring-red-100" : ""}`}>
          <div ref={workAreaRef} data-ibps-document-preview-area="true" className={`relative min-h-0 min-w-0 overflow-visible bg-slate-100 p-4 text-left sm:p-6 ${styles.previewWorkspace}`}>
            <input id="ibps-add-document-upload" name="ibps-add-document-upload" ref={addMoreInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onInputChange} />
            <div data-ibps-document-preview-grid="true" className={`grid w-full grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 md:block ${styles.documentGrid}`}>
              <article data-recruitment-compact-card="true" className="group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:border-red-200 hover:shadow-md sm:hidden">
                <div className="relative grid aspect-[3/4] max-sm:aspect-square place-items-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                  <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">1</span>
                  <button type="button" onClick={removeDocument} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-[#FF2D2D] shadow-sm transition hover:bg-red-100 active:scale-95" aria-label={`Remove ${document.file.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <img src={document.previewUrl} alt="" className="h-full w-full object-contain p-3 transition duration-200 group-hover:scale-[1.035]" />
                </div>
                <div className="mt-2 min-w-0">
                  <p className="flex min-w-0 max-w-full items-baseline text-sm font-black leading-snug text-slate-950" title={document.file.name}>
                    <span className="min-w-0 truncate">{displayName.stem}</span>
                    <span className="shrink-0">{displayName.extension}</span>
                  </p>
                  <p className="mt-1 inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">
                    {formatKb(document.file.size)} KB {"\u2022"} {document.width}
                    {"\u00d7"}
                    {document.height} px
                  </p>
                </div>
              </article>
              <div data-recruitment-desktop-preview="true" className="mx-auto hidden w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:block sm:p-5">
                <div className="mb-4 flex flex-col gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <p className="text-sm font-black text-slate-950">IBPS {config.label} preview</p>
                  <p className="text-xs font-bold text-slate-500">{config.hint}</p>
                </div>
                <div className="relative grid min-h-[clamp(18rem,62vh,46rem)] place-items-center overflow-visible rounded-xl bg-slate-50 p-4 sm:p-6">
                  <button type="button" onClick={removeDocument} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-[#FF2D2D] shadow-sm transition hover:bg-red-100 active:scale-95" aria-label={`Remove ${document.file.name}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <img src={document.previewUrl} alt={`Uploaded IBPS ${config.label} preview`} className="block h-auto max-h-[clamp(16rem,58vh,42rem)] w-auto max-w-full object-contain" />
                </div>
              </div>
              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            </div>
          </div>

          <div ref={actionBarRef} data-ibps-document-action-bar="true" className={`fixed bottom-0 left-0 right-0 z-50 box-border w-full max-w-full border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6 ${isConstrainedWorkspace ? styles.flowActionBar : ""}`}>
            <div className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0 xl:pl-10">{renderTypeSelector("sticky")}</div>
              <div className="w-full min-w-0 max-w-full xl:ml-auto xl:w-auto">{renderActionButtons()}</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={toolSectionRef} data-v0-managed-flow="true" id="ibps-document-resize-tool" className="mx-auto mt-6 w-[min(calc(100vw-2rem),64rem)] max-w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
      {renderLocalPageStyles()}
      {renderTypeSelector()}
      {renderUploadBox()}
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    </section>
  );
}
