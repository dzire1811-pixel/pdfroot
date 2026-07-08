"use client";

import { ChangeEvent, DragEvent, ReactNode, RefObject, useEffect } from "react";
import { CheckCircle2, Download, ImageUp, RefreshCw, RotateCcw, UploadCloud } from "lucide-react";

export type ImageWorkflowStage = "upload" | "workspace" | "processing" | "success";

export function useImageToolStageEffects({
  stage,
  toolRef,
  processingRef,
  successRef,
  shouldScrollToUploadRef,
  resultReady = false,
}: {
  stage: ImageWorkflowStage;
  toolRef: RefObject<HTMLElement | null>;
  processingRef?: RefObject<HTMLElement | null>;
  successRef?: RefObject<HTMLElement | null>;
  shouldScrollToUploadRef?: RefObject<boolean>;
  resultReady?: boolean;
}) {
  useEffect(() => {
    if (stage !== "processing") return;

    window.requestAnimationFrame(() => {
      const processingSection = processingRef?.current ?? toolRef.current;
      if (!processingSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      processingSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [processingRef, stage, toolRef]);

  useEffect(() => {
    if (stage !== "success" || !resultReady) return;

    window.requestAnimationFrame(() => {
      const successSection = successRef?.current ?? toolRef.current;
      if (!successSection) return;
      window.scrollTo({ top: 0, behavior: "auto" });
      successSection.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [resultReady, stage, successRef, toolRef]);

  useEffect(() => {
    if (stage !== "upload" || !shouldScrollToUploadRef?.current) return;

    shouldScrollToUploadRef.current = false;
    window.requestAnimationFrame(() => {
      const uploadSection = toolRef.current;
      if (!uploadSection) return;
      const pageHero = uploadSection.parentElement?.closest<HTMLElement>("section");
      const target = pageHero ?? uploadSection;
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });
  }, [shouldScrollToUploadRef, stage, toolRef]);

  useEffect(() => {
    const toolSection = toolRef.current;
    if (!toolSection || (stage !== "processing" && stage !== "success")) return;

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
  }, [stage, toolRef]);
}

export function ImageUploadBox({
  id,
  inputRef,
  accept,
  isDragging,
  title = "Drag & Drop Image",
  description = "Upload one or more JPG, JPEG, PNG, or WEBP images. Your images are processed in your browser.",
  buttonText = "Choose Files",
  multiple = false,
  onChange,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  id: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  accept: string;
  isDragging: boolean;
  title?: string;
  description?: string;
  buttonText?: string;
  multiple?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: DragEvent<HTMLLabelElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
}) {
  return (
    <label
      data-image-tool-upload="true"
      htmlFor={id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
        isDragging ? "border-white/90 bg-red-600" : "border-white/70 bg-[#FF2D2D] hover:border-white hover:bg-red-600"
      }`}
    >
      <input id={id} name={id} ref={inputRef} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={onChange} />
      <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105">
        <ImageUp className="h-16 w-16 stroke-[1.35]" aria-hidden="true" />
      </span>
      <span className="mt-3 text-xl font-black text-white">{title}</span>
      <span className="mt-2 max-w-md text-sm font-semibold leading-6 text-white/90">{description}</span>
      <span className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">
        {buttonText}
        <UploadCloud className="h-5 w-5" aria-hidden="true" />
      </span>
    </label>
  );
}

export function ImageProcessingScreen({
  sectionRef,
  text = "Processing your image...",
  detail = "Please wait, your files are being prepared",
}: {
  sectionRef: (node: HTMLElement | null) => void;
  text?: string;
  detail?: string;
}) {
  return (
    <section
      ref={sectionRef}
      data-v0-managed-flow="true"
      className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] lg:min-h-[calc(100vh-140px)]"
    >
      <div>
        <RefreshCw className="mx-auto h-9 w-9 animate-spin text-[#FF2D2D]" aria-hidden="true" />
        <p className="mt-4 text-base font-black text-slate-950">{text}</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">{detail}</p>
      </div>
    </section>
  );
}

export function ImageSuccessScreen({
  sectionRef,
  title = "Resize Complete",
  subtitle,
  downloadUrl,
  fileName,
  downloadLabel = "Download Image",
  onReset,
  children,
}: {
  sectionRef: (node: HTMLElement | null) => void;
  title?: string;
  subtitle: string;
  downloadUrl: string;
  fileName: string;
  downloadLabel?: string;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      ref={sectionRef}
      data-v0-managed-flow="true"
      className="mx-auto mt-6 grid min-h-[calc(100vh-120px)] w-[min(calc(100vw-2rem),64rem)] max-w-full place-items-center rounded-[2rem] border border-slate-200 bg-white p-4 pt-12 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6 sm:pt-14 lg:min-h-[calc(100vh-140px)]"
    >
      <div className="mx-auto w-full max-w-[720px] py-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
        <a href={downloadUrl} download={fileName} className="mt-5 inline-flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600">
          {downloadLabel}
          <Download className="h-6 w-6" aria-hidden="true" />
        </a>
        {children}
        <button type="button" onClick={onReset} className="mt-3 inline-flex items-center justify-center border-0 bg-transparent px-2 py-1 text-sm font-black text-[#FF2D2D] transition hover:text-red-700">
          Resize Another Image
        </button>
      </div>
    </section>
  );
}

export function ImagePreviewWorkspace({
  id,
  sectionRef,
  preview,
  previewLabel = "Uploaded image preview",
  fileName,
  fileMeta,
  status,
  error,
  children,
  actionLabel,
  actionIcon,
  onAction,
  actionDisabled = false,
  onReset,
  resetLabel = "Change image",
}: {
  id: string;
  sectionRef: (node: HTMLElement | null) => void;
  preview: ReactNode;
  previewLabel?: string;
  fileName?: string;
  fileMeta?: string;
  status?: string;
  error?: string | null;
  children: ReactNode;
  actionLabel: string;
  actionIcon?: ReactNode;
  onAction: () => void;
  actionDisabled?: boolean;
  onReset: () => void;
  resetLabel?: string;
}) {
  return (
    <section
      ref={sectionRef}
      data-v0-managed-flow="true"
      data-image-workspace="true"
      id={id}
      className="mx-auto mt-6 w-full max-w-full scroll-mt-32 bg-slate-100 text-left"
    >
      <div className="relative min-h-[calc(100vh-9rem)] pb-[11rem] sm:pb-36 lg:pb-28">
        <div className="mx-auto grid w-full max-w-[1600px] gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_clamp(20rem,32vw,26rem)] lg:items-start">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">Image uploaded and ready</p>
                {fileName && <p className="mt-1 truncate text-xs font-bold text-slate-500">{fileName}</p>}
              </div>
              {fileMeta && <p className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm">{fileMeta}</p>}
            </div>
            <div className="grid min-h-[min(72vh,42rem)] place-items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div aria-label={previewLabel} className="grid h-full w-full place-items-center">
                {preview}
              </div>
            </div>
          </div>

          <aside className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[90px] sm:p-5">
            {children}
            {status && <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>}
            {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{fileName ?? "Image ready"}</p>
            <p className="text-xs font-bold text-slate-500">Review settings, then continue.</p>
          </div>
          <div className="grid grid-cols-[minmax(7.5rem,1fr)_auto] gap-2 sm:min-w-[28rem]">
            <button
              type="button"
              onClick={onAction}
              disabled={actionDisabled}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF2D2D] px-4 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 sm:min-h-14 sm:px-5 sm:text-base"
            >
              {actionLabel}
              {actionIcon}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-800 transition hover:border-red-200 hover:text-[#FF2D2D] sm:min-h-14 sm:gap-2 sm:px-4 sm:text-sm"
            >
              {resetLabel}
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
