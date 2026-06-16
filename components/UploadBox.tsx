"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, ImageUp, UploadCloud } from "lucide-react";
import { tools } from "@/lib/tools";
import { clearUploadSession, readUploadSession, saveUploadSession } from "@/lib/uploadSession";

const acceptedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"];
const acceptValue = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
].join(",");

type FileGroup = "pdf" | "image" | "word" | "excel" | "powerpoint" | "unknown";

function getExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function getFileGroup(file: File): FileGroup {
  const extension = getExtension(file.name);
  if (extension === ".pdf" || file.type === "application/pdf") return "pdf";
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension) || file.type.startsWith("image/")) return "image";
  if ([".doc", ".docx"].includes(extension)) return "word";
  if ([".xls", ".xlsx"].includes(extension)) return "excel";
  if ([".ppt", ".pptx"].includes(extension)) return "powerpoint";
  return "unknown";
}

function isSupportedFile(file: File) {
  return getFileGroup(file) !== "unknown" && acceptedExtensions.includes(getExtension(file.name));
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function suggestedSlugs(groups: FileGroup[]) {
  const uniqueGroups = Array.from(new Set(groups));
  const slugs = new Set<string>();

  if (uniqueGroups.includes("pdf")) {
    ["merge-pdf", "split-pdf", "compress-pdf", "pdf-to-jpg", "pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint"].forEach((slug) => slugs.add(slug));
  }
  if (uniqueGroups.includes("image")) {
    ["resize-image-to-exact-kb", "compress-image", "jpg-to-pdf", "front-back-card-merge", "passport-photo-maker", "signature-resize-tool"].forEach((slug) => slugs.add(slug));
  }
  if (uniqueGroups.includes("word")) {
    ["word-to-pdf", "pdf-to-word"].forEach((slug) => slugs.add(slug));
  }
  if (uniqueGroups.includes("excel")) {
    ["excel-to-pdf", "pdf-to-excel"].forEach((slug) => slugs.add(slug));
  }
  if (uniqueGroups.includes("powerpoint")) {
    ["powerpoint-to-pdf", "pdf-to-powerpoint"].forEach((slug) => slugs.add(slug));
  }

  return Array.from(slugs)
    .map((slug) => tools.find((tool) => tool.slug === slug))
    .filter((tool): tool is (typeof tools)[number] => Boolean(tool))
    .slice(0, 6);
}

export function UploadBox({
  title = "Drop files here",
  description = "Upload PDFs, images, photos, signatures, Word, Excel, or PowerPoint files.",
  restoreTransferredFiles = false,
}: {
  title?: string;
  description?: string;
  restoreTransferredFiles?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const suggestions = useMemo(() => suggestedSlugs(selectedFiles.map(getFileGroup)), [selectedFiles]);

  async function handleFiles(fileList: FileList | File[]) {
    const incomingFiles = Array.from(fileList);
    const validFiles = incomingFiles.filter(isSupportedFile);
    const invalidFiles = incomingFiles.filter((file) => !isSupportedFile(file));

    if (validFiles.length > 0) {
      await saveUploadSession(validFiles);
      setSelectedFiles(validFiles);
    } else {
      setSelectedFiles([]);
    }
    setError(
      invalidFiles.length
        ? `Unsupported file type: ${invalidFiles.map((file) => file.name).join(", ")}. Please upload PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX, XLS, XLSX, PPT, or PPTX files.`
        : "",
    );
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void handleFiles(event.target.files);
      event.target.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  function clearFiles() {
    setSelectedFiles([]);
    setError("");
    clearUploadSession();
  }

  useEffect(() => {
    if (!restoreTransferredFiles) {
      clearUploadSession();
      return;
    }

    let isActive = true;
    void readUploadSession().then((files) => {
      if (isActive && files.length > 0) {
        setSelectedFiles(files.filter(isSupportedFile));
      }
    });

    return () => {
      isActive = false;
    };
  }, [restoreTransferredFiles]);

  return (
    <div id="upload" className="group rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_30px_80px_rgba(255,45,45,0.12)]">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-[1.35rem] border-2 border-dashed p-7 text-center transition duration-300 sm:p-8 ${
          isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 group-hover:border-[#FF2D2D] group-hover:bg-red-50"
        }`}
      >
        <input ref={inputRef} className="sr-only" type="file" multiple accept={acceptValue} onChange={onInputChange} />
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition duration-300 group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
          <ImageUp className="h-10 w-10" aria-hidden="true" />
        </div>
        <h2 className="upload-title mt-5 font-black text-slate-950">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
        <button
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-7 py-3.5 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition duration-300 hover:-translate-y-0.5 hover:bg-red-600"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          Choose Files
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">{error}</p>}

      {selectedFiles.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Uploaded files</p>
            <button type="button" onClick={clearFiles} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Remove
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {selectedFiles.map((file) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                <span className="min-w-0 truncate font-black text-slate-950">{file.name}</span>
                <span className="shrink-0 font-semibold text-slate-500">{formatSize(file.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/50 p-4 text-left">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF2D2D]">Suggested tools</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((tool) => {
              const Icon = tool.icon ?? FileText;
              return (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  onClick={() => {
                    void saveUploadSession(selectedFiles);
                  }}
                  className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:text-[#FF2D2D]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-[#FF2D2D]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {tool.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {["Secure Files", "Fast Processing", "Instant Download"].map((label, index) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50">
            {index === 2 ? <Download className="mr-2 inline h-4 w-4 text-[#FF2D2D]" aria-hidden="true" /> : null}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
