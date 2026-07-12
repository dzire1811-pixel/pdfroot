"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, GripVertical, ImageUp, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  dataUrl: string;
};

type PdfResult = {
  blob: Blob;
  url: string;
  sizeKb: number;
};

type WorkflowStep = "arrange" | "convert" | "download";
type PageSize = "a4" | "letter";
type Orientation = "auto" | "portrait" | "landscape";
type MarginSize = "none" | "small" | "large";
type ImageFit = "contain" | "cover";
type PageOrder = "current" | "reverse";

type PdfSettings = { pageSize: PageSize; orientation: Orientation; margin: MarginSize; imageFit: ImageFit; pageOrder: PageOrder };

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function formatResultSize(sizeKb: number) {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
}

function createId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fileToImage(file: File) {
  return new Promise<ImageItem>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Your browser does not support image processing."));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0);

      resolve({
        id: createId(file),
        file,
        url: objectUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not read ${file.name}. Please upload JPG, JPEG, PNG, or WEBP images.`));
    };

    image.src = objectUrl;
  });
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function buildPdf(items: ImageItem[], settings: PdfSettings) {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [0];
  let position = 0;
  let objectId = 1;
  const pageObjectIds: number[] = [];
  const orderedItems = settings.pageOrder === "reverse" ? [...items].reverse() : items;
  const pageData = orderedItems.map((item) => {
    const ratio = item.width / item.height;
    const landscape = settings.orientation === "landscape" || (settings.orientation === "auto" && ratio >= 1);
    const base = settings.pageSize === "letter" ? [612, 792] : [595, 842];
    const pageWidth = landscape ? base[1] : base[0];
    const pageHeight = landscape ? base[0] : base[1];
    const margin = settings.margin === "none" ? 0 : settings.margin === "large" ? 56 : 28;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const imageRatio = item.width / item.height;
    let drawWidth = maxWidth;
    let drawHeight = drawWidth / imageRatio;
    if (settings.imageFit === "contain" ? drawHeight > maxHeight : drawHeight < maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight * imageRatio;
    }

    return {
      ...item,
      pageWidth,
      pageHeight,
      drawWidth,
      drawHeight,
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      imageObjectId: objectId++,
      contentObjectId: objectId++,
      pageObjectId: objectId++,
    };
  });
  const pagesObjectId = objectId++;
  const catalogObjectId = objectId++;

  function write(value: string | Uint8Array) {
    const chunk = typeof value === "string" ? encoder.encode(value) : value;
    parts.push(chunk as BlobPart);
    position += chunk.length;
  }

  function beginObject(id: number) {
    offsets[id] = position;
    write(`${id} 0 obj\n`);
  }

  write("%PDF-1.4\n%PDFRoot\n");

  for (const item of pageData) {
    const imageBytes = dataUrlToBytes(item.dataUrl);
    beginObject(item.imageObjectId);
    write(`<< /Type /XObject /Subtype /Image /Width ${item.width} /Height ${item.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    write(imageBytes);
    write("\nendstream\nendobj\n");

    const content = `q\n${item.drawWidth.toFixed(2)} 0 0 ${item.drawHeight.toFixed(2)} ${item.x.toFixed(2)} ${item.y.toFixed(2)} cm\n/Im${item.imageObjectId} Do\nQ\n`;
    beginObject(item.contentObjectId);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    pageObjectIds.push(item.pageObjectId);
    beginObject(item.pageObjectId);
    write(
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${item.pageWidth} ${item.pageHeight}] /Resources << /XObject << /Im${item.imageObjectId} ${item.imageObjectId} 0 R >> >> /Contents ${item.contentObjectId} 0 R >>\nendobj\n`,
    );
  }

  beginObject(pagesObjectId);
  write(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`);

  beginObject(catalogObjectId);
  write(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>\nendobj\n`);

  const xrefOffset = position;
  write(`xref\n0 ${catalogObjectId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= catalogObjectId; id += 1) {
    write(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${catalogObjectId + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

export function JpgToPdfTool({ pngOnly = false }: { pngOnly?: boolean } = {}) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload images to convert into PDF.");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("arrange");
  const [result, setResult] = useState<PdfResult | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [margin, setMargin] = useState<MarginSize>("small");
  const [imageFit, setImageFit] = useState<ImageFit>("contain");
  const [pageOrder, setPageOrder] = useState<PageOrder>("current");
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isActionBarVisible, setIsActionBarVisible] = useState(false);
  const [isSettingsDrawerClosing, setIsSettingsDrawerClosing] = useState(false);
  const [isSettingsDrawerDragging, setIsSettingsDrawerDragging] = useState(false);
  const [settingsDrawerDragOffset, setSettingsDrawerDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const mobileSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  const resultRef = useRef<PdfResult | null>(null);
  const drawerDragStartYRef = useRef<number | null>(null);
  const drawerDragOffsetRef = useRef(0);
  const settingsDrawerClosingRef = useRef(false);

  function scrollToolStageIntoView() {
    window.requestAnimationFrame(() => {
      const toolSection = document.getElementById(pngOnly ? "png-to-pdf-tool" : "jpg-to-pdf-tool");
      const headingBlock = toolSection?.closest(".max-w-4xl");
      const target = headingBlock ?? workAreaRef.current;
      if (!target) return;

      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 28;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  function clearResult() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
    setResult(null);
  }

  function openSettingsDrawer() {
    if (window.innerWidth < 640 && workAreaRef.current) {
      const y = workAreaRef.current.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
    }
    setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerOpen(true);
    settingsDrawerClosingRef.current = false;
    drawerDragOffsetRef.current = 0;
  }

  const closeSettingsDrawer = useCallback(() => {
    if (!isSettingsDrawerOpen || isSettingsDrawerClosing || settingsDrawerClosingRef.current) return;
    const closeDistance = Math.max(window.innerHeight, 420);
    settingsDrawerClosingRef.current = true;
    drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); setIsSettingsDrawerClosing(true); setSettingsDrawerDragOffset(closeDistance);
    drawerDragOffsetRef.current = closeDistance;
    window.setTimeout(() => {
      setIsSettingsDrawerOpen(false); setIsSettingsDrawerClosing(false); setIsSettingsDrawerDragging(false); setSettingsDrawerDragOffset(0);
      settingsDrawerClosingRef.current = false; drawerDragOffsetRef.current = 0;
      window.requestAnimationFrame(() => mobileSettingsButtonRef.current?.focus());
    }, 240);
  }, [isSettingsDrawerClosing, isSettingsDrawerOpen]);

  const updateSettingsDrawerDrag = useCallback((clientY: number) => {
    if (drawerDragStartYRef.current === null) return;
    const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
    drawerDragOffsetRef.current = dragDistance;
    setSettingsDrawerDragOffset(dragDistance);
  }, []);

  const finishApprovedDrawerDrag = useCallback((clientY?: number) => {
    if (drawerDragStartYRef.current === null) return;
    if (typeof clientY === "number") {
      const dragDistance = Math.max(0, clientY - drawerDragStartYRef.current);
      drawerDragOffsetRef.current = dragDistance;
      setSettingsDrawerDragOffset(dragDistance);
    }
    drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false);
    if (drawerDragOffsetRef.current >= 84) return closeSettingsDrawer();
    drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0);
  }, [closeSettingsDrawer]);

  function beginApprovedDrawerDrag(clientY: number) {
    if (settingsDrawerClosingRef.current) return;
    drawerDragStartYRef.current = clientY; drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); setIsSettingsDrawerDragging(true);
  }
  function onApprovedPointerDown(event: PointerEvent<HTMLButtonElement>) { beginApprovedDrawerDrag(event.clientY); event.currentTarget.setPointerCapture(event.pointerId); }
  function onApprovedPointerMove(event: PointerEvent<HTMLButtonElement>) { updateSettingsDrawerDrag(event.clientY); }
  function onApprovedMouseDown(event: MouseEvent<HTMLButtonElement>) { beginApprovedDrawerDrag(event.clientY); }
  function onApprovedTouchStart(event: TouchEvent<HTMLButtonElement>) { if (event.touches[0]) beginApprovedDrawerDrag(event.touches[0].clientY); }
  function onApprovedTouchMove(event: TouchEvent<HTMLButtonElement>) { if (event.touches[0]) updateSettingsDrawerDrag(event.touches[0].clientY); }
  function clearApprovedDrawerDrag() { if (!settingsDrawerClosingRef.current) { drawerDragStartYRef.current = null; setIsSettingsDrawerDragging(false); drawerDragOffsetRef.current = 0; setSettingsDrawerDragOffset(0); } }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    clearResult();
    const nextFiles = Array.from(files);

    if (!nextFiles.length) return;

    const invalid = nextFiles.find((file) => pngOnly ? file.type !== "image/png" && !/\.png$/i.test(file.name) : !["image/jpeg", "image/png", "image/webp"].includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name));

    if (invalid) {
      setError(`"${invalid.name}" is not supported. Please upload ${pngOnly ? "PNG images" : "JPG, JPEG, PNG, or WEBP images"} only.`);
      return;
    }

    if (items.length + nextFiles.length > 40) {
      setError("Please upload up to 40 images at a time.");
      return;
    }

    try {
      const loaded = await Promise.all(nextFiles.map(fileToImage));
      setItems((current) => [...current, ...loaded]);
      setWorkflowStep("arrange");
      setProgress(0);
      setStatus("Images added. Arrange the order, then convert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load one of the images.");
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      void addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) {
      void addFiles(event.dataTransfer.files);
    }
  }

  function removeItem(id: string) {
    clearResult();
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
    setWorkflowStep("arrange");
    setProgress(0);
    setStatus("Image removed. Arrange the remaining images, then convert.");
  }

  function clearAll() {
    clearResult();
    items.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setDraggedId(null);
    setError(null);
    setProgress(0);
    setStatus("Upload images to convert into PDF.");
    setWorkflowStep("arrange");
  }

  function reorderByDragEnter(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    clearResult();
    setItems((current) => {
      const draggedIndex = current.findIndex((item) => item.id === draggedId);
      const targetIndex = current.findIndex((item) => item.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return current;
      }

      const next = [...current];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setProgress(0);
    setWorkflowStep("arrange");
    setStatus("Order updated. Convert when ready.");
  }

  async function convertToPdf() {
    if (!items.length) {
      setWorkflowStep("arrange");
      setError("Please upload at least one image first.");
      return;
    }

    setError(null);
    setWorkflowStep("convert");
    setProgress(10);
    clearResult();

    try {
      setStatus(`Converting ${items.length} image${items.length === 1 ? "" : "s"} into PDF...`);
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      setProgress(70);
      const blob = buildPdf(items, { pageSize, orientation, margin, imageFit, pageOrder });
      setStatus("Preparing PDF download...");
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        sizeKb: blob.size / 1024,
      });
      setProgress(100);
      setStatus(`Converted ${items.length} image${items.length === 1 ? "" : "s"} successfully.`);
      setWorkflowStep("download");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the PDF. Please try again.");
      setStatus("Conversion failed.");
      setProgress(0);
      setWorkflowStep("arrange");
    }
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (isActive && files.length > 0) {
        void addFiles(files);
      }
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      if (resultRef.current?.url) {
        URL.revokeObjectURL(resultRef.current.url);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeSettingsDrawer(); };
    const onApprovedResize = () => { if (window.innerWidth >= 640) closeSettingsDrawer(); };
    const onPointerMove = (event: globalThis.PointerEvent) => updateSettingsDrawerDrag(event.clientY);
    const onMouseMove = (event: globalThis.MouseEvent) => updateSettingsDrawerDrag(event.clientY);
    const onTouchMove = (event: globalThis.TouchEvent) => { if (event.touches[0]) updateSettingsDrawerDrag(event.touches[0].clientY); };
    const onPointerEnd = (event: globalThis.PointerEvent) => finishApprovedDrawerDrag(event.clientY);
    const onMouseEnd = (event: globalThis.MouseEvent) => finishApprovedDrawerDrag(event.clientY);
    const onTouchEnd = (event: globalThis.TouchEvent) => finishApprovedDrawerDrag(event.changedTouches[0]?.clientY);
    document.addEventListener("keydown", onKeyDown); window.addEventListener("resize", onApprovedResize);
    window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", onPointerEnd); window.addEventListener("pointercancel", clearApprovedDrawerDrag);
    window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: true }); window.addEventListener("touchend", onTouchEnd); window.addEventListener("touchcancel", clearApprovedDrawerDrag);
    return () => {
      document.removeEventListener("keydown", onKeyDown); window.removeEventListener("resize", onApprovedResize);
      window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerEnd); window.removeEventListener("pointercancel", clearApprovedDrawerDrag);
      window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseEnd);
      window.removeEventListener("touchmove", onTouchMove); window.removeEventListener("touchend", onTouchEnd); window.removeEventListener("touchcancel", clearApprovedDrawerDrag);
    };
  }, [closeSettingsDrawer, finishApprovedDrawerDrag, isSettingsDrawerOpen, updateSettingsDrawerDrag]);

  useEffect(() => {
    if (workflowStep === "convert" || workflowStep === "download") {
      scrollToolStageIntoView();
    }
  }, [workflowStep]);

  useEffect(() => {
    if (items.length === 0 || workflowStep !== "arrange") {
      setIsActionBarVisible(false);
      return;
    }
    let frame = 0;
    const update = () => {
      const workspace = workspaceRef.current;
      const workArea = workAreaRef.current;
      if (!workspace || !workArea) return setIsActionBarVisible(false);
      const barHeight = actionBarRef.current?.offsetHeight ?? (window.innerWidth < 640 && pngOnly ? 120 : 96);
      const workRect = workArea.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const workAreaInView = workRect.bottom > 0 && workRect.top < window.innerHeight;
      const desktopOrPngVisibility = workAreaInView && workspaceRect.bottom > window.innerHeight - barHeight - 8;
      setIsActionBarVisible(window.innerWidth < 640 ? workAreaInView : (!pngOnly ? true : desktopOrPngVisibility));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [items.length, pngOnly, workflowStep]);

  function renderUploadBox() {
    return (
      <label
        data-primary-upload="true"
        htmlFor={pngOnly ? "png-pdf-upload" : "jpg-pdf-upload"}
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
        <input id={pngOnly ? "png-pdf-upload" : "jpg-pdf-upload"} name={pngOnly ? "png-pdf-upload" : "jpg-pdf-upload"} ref={fileInputRef} className="sr-only" type="file" accept={pngOnly ? "image/png,.png" : "image/jpeg,image/png,image/webp"} multiple onChange={onInputChange} />
        <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
          <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
        </span>
        <span className="sr-only">Drag and drop images</span>
        <span className="sr-only">Upload JPG, JPEG, PNG, or WEBP images, reorder them, and convert into one PDF document.</span>
        <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
          {pngOnly ? "Choose PNG Files" : "Choose Images"}
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
    );
  }

  function renderAddMoreButton(disabled = false) {
    return (
      <label
        htmlFor="jpg-pdf-workspace-upload"
        aria-label="Add more images"
        title="Add more images"
        className={`relative inline-grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#FF2D2D] text-white shadow-[0_14px_30px_rgba(255,45,45,0.3)] transition hover:-translate-y-0.5 hover:bg-red-600 active:scale-95 sm:h-14 sm:w-14 ${
          disabled ? "pointer-events-none cursor-not-allowed opacity-60 hover:translate-y-0" : "cursor-pointer"
        }`}
      >
        {items.length > 0 && (
          <span className="absolute -left-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-950 px-1.5 text-[0.7rem] font-black leading-none text-white ring-2 ring-white">
            {items.length}
          </span>
        )}
        <Plus className="h-7 w-7 stroke-[3]" aria-hidden="true" />
      </label>
    );
  }

  function renderImagePreview(item: ImageItem) {
    return (
      <div className="relative grid h-full w-full place-items-center overflow-hidden bg-white">
        <img src={item.url} alt="" className="h-full w-full object-contain p-3" />
      </div>
    );
  }

  function renderProcessingCard() {
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Converting your images...</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">Please wait while we prepare your PDF.</p>
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
    return (
      <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
          </div>
          <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950">Your PDF is ready!</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">{result ? `${items.length} ${items.length === 1 ? "image" : "images"} - ${formatResultSize(result.sizeKb)}` : "Ready"}</p>
          {result && (
            <a
              href={result.url}
              download="PDFRoot-images.pdf"
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-6 py-4 text-base font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600"
            >
              Download PDF
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]"
          >
            {pngOnly ? "Convert more PNG files" : "Process another file"}
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderSettings() {
    const groups = [
      { label: "Page size", value: pageSize, set: (v: string) => setPageSize(v as PageSize), options: [["a4", "A4"], ["letter", "Letter"]] },
      { label: "Orientation", value: orientation, set: (v: string) => setOrientation(v as Orientation), options: [["auto", "Auto"], ["portrait", "Portrait"], ["landscape", "Landscape"]] },
      { label: "Margins", value: margin, set: (v: string) => setMargin(v as MarginSize), options: [["none", "None"], ["small", "Small"], ["large", "Large"]] },
      { label: "Image fit", value: imageFit, set: (v: string) => setImageFit(v as ImageFit), options: [["contain", "Fit"], ["cover", "Fill"]] },
      { label: "Page order", value: pageOrder, set: (v: string) => setPageOrder(v as PageOrder), options: [["current", "Current"], ["reverse", "Reverse"]] },
    ];
    return <div className="grid min-w-0 gap-3">{groups.map((group) => <fieldset key={group.label} className="min-w-0"><legend className="mb-1 text-[0.68rem] font-black uppercase tracking-wide text-slate-500">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.options.map(([value, label]) => <button key={value} type="button" onClick={() => group.set(value)} className={`h-9 rounded-lg border px-2.5 text-xs font-black transition ${group.value === value ? "border-[#FF2D2D] bg-[#FF2D2D] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"}`}>{label}</button>)}</div></fieldset>)}</div>;
  }

  function renderDesktopSettings() {
    const groups = [
      { label: "Size", value: pageSize, set: (v: string) => setPageSize(v as PageSize), options: [["a4", "A4"], ["letter", "Letter"]] },
      { label: "Orientation", value: orientation, set: (v: string) => setOrientation(v as Orientation), options: [["auto", "Auto"], ["portrait", "Portrait"], ["landscape", "Landscape"]] },
      { label: "Margins", value: margin, set: (v: string) => setMargin(v as MarginSize), options: [["none", "None"], ["small", "Small"], ["large", "Large"]] },
      { label: "Fit", value: imageFit, set: (v: string) => setImageFit(v as ImageFit), options: [["contain", "Fit"], ["cover", "Fill"]] },
      { label: "Order", value: pageOrder, set: (v: string) => setPageOrder(v as PageOrder), options: [["current", "Current"], ["reverse", "Reverse"]] },
    ];
    return <div className="flex min-w-max flex-nowrap items-end gap-2 pb-1">{groups.map((group) => <label key={group.label} className="w-[5.75rem] shrink-0"><span className="mb-1 block text-[0.62rem] font-black uppercase tracking-wide text-slate-500">{group.label}</span><select value={group.value} onChange={(event) => group.set(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 outline-none transition focus:border-[#FF2D2D] focus:ring-2 focus:ring-red-100">{group.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div>;
  }

  function renderWorkspace() {
    return (
      <div ref={workAreaRef} data-merge-preview-area="true" data-workflow-step={workflowStep} className={`relative min-w-0 bg-slate-100 p-4 text-left sm:p-6 ${workflowStep === "download" ? "min-h-0" : "min-h-[calc(100dvh-9rem)]"}`}>
        <div className="transition duration-300">
          {workflowStep === "arrange" && (
            <div data-merge-card-grid="true" className={`grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] items-start justify-center gap-4 sm:gap-5 ${pngOnly ? "pb-[28rem] sm:pb-56 lg:pb-40 xl:pb-28" : "pb-[28rem] sm:pb-0"}`}>
                {items.map((item, index) => (
                <article
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={() => reorderByDragEnter(item.id)}
                  onDrop={() => setDraggedId(null)}
                  onDragEnd={() => setDraggedId(null)}
                  className={`group relative flex h-full min-w-0 cursor-grab flex-col rounded-2xl border bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:scale-[1.015] hover:shadow-md active:cursor-grabbing ${
                    draggedId === item.id ? "border-red-300 opacity-70" : "border-slate-200 hover:border-red-200"
                  }`}
                >
                  <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="absolute left-2 top-2 z-10 grid h-8 min-w-8 place-items-center rounded-full bg-[#FF2D2D] px-2 text-xs font-black text-white shadow-[0_10px_20px_rgba(255,45,45,0.24)]">
                      {index + 1}
                    </span>
                    <button type="button" onClick={() => removeItem(item.id)} className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-[#FF2D2D]" aria-label={`Remove ${item.file.name}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    <span className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-slate-600 shadow-sm">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="h-full w-full transition duration-200 group-hover:scale-[1.035]">{renderImagePreview(item)}</div>
                  </div>
                  <div className="mt-2 min-w-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black leading-snug text-slate-950" title={item.file.name}>{item.file.name}</p>
                      <p className="mt-1.5 inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[0.68rem] font-bold leading-none text-slate-600">{formatKb(item.file.size)} KB</p>
                    </div>
                  </div>
                </article>
                ))}
            </div>
          )}
          {workflowStep === "convert" && renderProcessingCard()}
          {workflowStep === "download" && renderSuccessCard()}
        </div>
      </div>
    );
  }

  function renderActionButtons(isConverting: boolean) {
    return (
      <div className="grid grid-cols-[3rem_minmax(7.5rem,1fr)_minmax(5.5rem,0.75fr)] gap-2 sm:grid-cols-[3.5rem_minmax(12rem,1fr)_auto] lg:w-auto lg:min-w-[30rem]">
        {renderAddMoreButton(isConverting)}
        <button type="button" onClick={() => void convertToPdf()} disabled={isConverting} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base">
          {isConverting ? "Converting..." : "Convert to PDF"}
          <FileText className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={clearAll} disabled={isConverting} className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm">
          Clear all
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderBottomActionBar() {
    const isConverting = workflowStep === "convert";

    return (
      <div ref={actionBarRef} data-merge-action-bar="true" data-jpg-to-pdf-action-bar="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:self-center">
            <p className="truncate text-sm font-black text-slate-950">{items.length} {items.length === 1 ? "image" : "images"} ready</p>
            <button ref={mobileSettingsButtonRef} type="button" onClick={openSettingsDrawer} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm sm:hidden" aria-controls={pngOnly ? "png-to-pdf-mobile-settings-drawer" : "jpg-to-pdf-mobile-settings-drawer"} aria-expanded={isSettingsDrawerOpen}><SlidersHorizontal className="h-4 w-4 text-[#FF2D2D]" />Settings</button>
          </div>

          <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain sm:block">{renderDesktopSettings()}</div>

          <div className="min-w-0 sm:ml-auto">
            {renderActionButtons(isConverting)}
          </div>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:col-span-3">{error}</p>}
        </div>
      </div>
    );
  }

  function renderMobileSettingsDrawer() {
    if (!isSettingsDrawerOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] sm:hidden">
        <style>{`@keyframes jpgToPdfApprovedDrawerIn { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <button type="button" className={`absolute inset-0 bg-slate-950/35 transition-opacity duration-200 ${isSettingsDrawerClosing ? "opacity-0" : "opacity-100"}`} aria-label="Close settings backdrop" onClick={closeSettingsDrawer} />
        <div id={pngOnly ? "png-to-pdf-mobile-settings-drawer" : "jpg-to-pdf-mobile-settings-drawer"} role="dialog" aria-modal="true" aria-label={pngOnly ? "PNG to PDF settings" : "JPG to PDF settings"} style={{ transform: `translateY(${settingsDrawerDragOffset}px)` }} className={`absolute inset-x-0 bottom-0 flex max-h-[min(44vh,23rem)] flex-col overflow-visible rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] ${isSettingsDrawerDragging ? "" : "transition-transform duration-[240ms] ease-out"} ${isSettingsDrawerClosing ? "" : "animate-[jpgToPdfApprovedDrawerIn_220ms_ease-out]"} ${settingsDrawerDragOffset > 0 && !isSettingsDrawerClosing ? "will-change-transform" : ""}`}>
          <button type="button" className="absolute left-1/2 top-2 z-10 flex h-10 w-24 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center bg-transparent active:cursor-grabbing" aria-label="Drag down to close settings" onPointerDown={onApprovedPointerDown} onPointerMove={onApprovedPointerMove} onPointerUp={(event) => finishApprovedDrawerDrag(event.clientY)} onPointerCancel={clearApprovedDrawerDrag} onLostPointerCapture={clearApprovedDrawerDrag} onMouseDown={onApprovedMouseDown} onMouseUp={(event) => finishApprovedDrawerDrag(event.clientY)} onTouchStart={onApprovedTouchStart} onTouchMove={onApprovedTouchMove} onTouchEnd={(event) => finishApprovedDrawerDrag(event.changedTouches[0]?.clientY)} onTouchCancel={clearApprovedDrawerDrag}><span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" /></button>
          <div className="relative shrink-0 overflow-hidden rounded-t-2xl border-b border-slate-200 px-4 pb-3 pt-5"><p className="text-sm font-black text-slate-950">PDF settings</p><button type="button" onClick={closeSettingsDrawer} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950 active:scale-95" aria-label="Close settings"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{renderSettings()}</div>
          <div className="shrink-0 rounded-b-2xl border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{renderActionButtons(false)}</div>
        </div>
      </div>
    );
  }

  return (
    <section
      data-v0-managed-flow="true"
      data-merge-pdf-workspace={items.length ? "true" : undefined}
      id={pngOnly ? "png-to-pdf-tool" : "jpg-to-pdf-tool"}
      className={`mx-auto mt-6 max-w-full text-left ${
        items.length ? "w-full scroll-mt-32 overflow-visible border-0 bg-transparent p-0 shadow-none" : "w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6"
      }`}
    >
      {items.length ? (
        <div ref={workspaceRef} className={`relative min-w-0 overflow-visible bg-slate-100 transition ${workflowStep === "arrange" ? "min-h-[calc(100dvh-9rem)]" : ""}`}>
          <input id="jpg-pdf-workspace-upload" name="jpg-pdf-workspace-upload" ref={addMoreInputRef} className="sr-only" type="file" accept={pngOnly ? "image/png,.png" : "image/jpeg,image/png,image/webp"} multiple onChange={onInputChange} />
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
