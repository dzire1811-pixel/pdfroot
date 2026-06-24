"use client";

import { ChangeEvent, DragEvent, ReactNode, RefObject, useEffect } from "react";
import { CheckCircle2, Download, ImageUp, RefreshCw, UploadCloud } from "lucide-react";

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
      <input id={id} ref={inputRef} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={onChange} />
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
