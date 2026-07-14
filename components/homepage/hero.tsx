"use client";

import { useState } from "react";
import { Check, ImageUp, UploadCloud } from "lucide-react";
import { ToolSearch } from "@/components/ToolSearch";

type LauncherFileKind = "pdf" | "image";

function getLauncherFileKind(file: File): LauncherFileKind | null {
  const lowerName = file.name.toLowerCase();
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(file.name)) return "image";
  return null;
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b bg-white">
      {/* PDFRoot homepage hero alignment fixed */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:80px_80px] opacity-60" />

      <div className="relative mx-auto max-w-[1800px] px-6 pb-10 pt-16 lg:px-8 lg:pb-12 lg:pt-24">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,12fr)_minmax(0,13fr)] lg:items-center">
          <div className="w-full">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
              PDF &amp; Government Form Tools
            </div>

            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Convert PDFs &amp; Resize Images for Government Forms in Seconds
            </h1>

            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Convert, compress, merge and split PDFs. Resize photos and signatures for SSC, RRB, UPSC, IBPS, GPSC and OJAS applications.
            </p>

            <ToolSearch />

            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-foreground sm:max-w-md">
              {["No Registration Required", "Files processed locally", "Mobile Friendly", "Free Online Tools"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

function HeroPreview() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const kind = getLauncherFileKind(file);
    if (!kind) return;
    setSelectedFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="w-full">
      <div className="w-full rounded-[1.5rem] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
        <label
          htmlFor="homepage-upload"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border-[1.5px] border-dashed border-white px-5 py-6 text-center transition sm:px-7 ${
            isDragging ? "bg-[#e92f2f]" : "bg-[#ef3030] hover:bg-[#e92f2f]"
          }`}
        >
          <input id="homepage-upload" name="homepage-upload" type="file" className="sr-only" accept="image/jpeg,image/png,.jpg,.jpeg,.png,.pdf,application/pdf" onChange={(event) => handleFiles(event.currentTarget.files)} />
          <span className="sr-only">Drag &amp; Drop Files</span>
          <span className="grid h-16 w-16 place-items-center text-white transition group-hover:scale-105">
            <ImageUp className="h-12 w-12 stroke-[1.8]" aria-hidden="true" />
          </span>
          <span className="mt-4 inline-flex items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-[0_16px_35px_rgba(15,23,42,0.16)] transition group-hover:-translate-y-0.5">
            Choose Files
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-3 text-lg font-semibold text-white">or drop files here</span>
          <span className="mt-2 text-xs font-normal text-white/85">PDF, JPG and PNG • Files processed locally</span>
          <span className="sr-only" aria-live="polite">{selectedFile ? `${selectedFile.name} selected.` : ""}</span>
        </label>
      </div>
    </div>
  );
}
