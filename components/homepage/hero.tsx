"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileType, ImageIcon, ImageUp, SlidersHorizontal, UploadCloud } from "lucide-react";
import { ToolSearch } from "@/components/ToolSearch";

const HOMEPAGE_UPLOAD_KEY = "pdfroot-homepage-upload";
const HOMEPAGE_UPLOAD_STORE = "homepage-uploads";

function getHomepageUploadRoute(file: File) {
  const lowerName = file.name.toLowerCase();
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) return "/compress-pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) return "/resize-image-to-exact-kb";
  return "/tools";
}

function saveHomepageUpload(file: File, route: string) {
  if (typeof window === "undefined") return Promise.resolve();

  window.sessionStorage.setItem(
    HOMEPAGE_UPLOAD_KEY,
    JSON.stringify({
      route,
      name: file.name,
      type: file.type,
      size: file.size,
      updatedAt: Date.now(),
    }),
  );

  return new Promise<void>((resolve) => {
    const request = window.indexedDB.open(HOMEPAGE_UPLOAD_STORE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(file, HOMEPAGE_UPLOAD_KEY);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        resolve();
      };
    };
  });
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b bg-white">
      {/* PDFRoot homepage hero alignment fixed */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:80px_80px] opacity-60" />

      <div className="relative mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[0.95fr_1.05fr]">
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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#tools" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 text-base font-medium text-foreground transition hover:bg-muted">
                Explore All Tools
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-foreground sm:max-w-md">
              {["No Registration Required", "Secure Processing", "Mobile Friendly", "Free Online Tools"].map((item) => (
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
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const route = getHomepageUploadRoute(file);
    await saveHomepageUpload(file, route);
    router.push(route);
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function run() {
      setDone(false);
      setProgress(0);
      const tick = (value: number) => {
        if (value >= 100) {
          setProgress(100);
          setDone(true);
          timer = setTimeout(run, 2600);
          return;
        }
        setProgress(value);
        timer = setTimeout(() => tick(value + 4), 60);
      };
      timer = setTimeout(() => tick(0), 600);
    }
    run();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="w-full rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-7">
        <label
          htmlFor="homepage-upload"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border-2 border-dotted px-5 py-9 text-center transition sm:px-7 ${
            isDragging ? "border-white bg-[#e92f2f]" : "border-red-200 bg-[#ef3030] hover:bg-[#e92f2f]"
          }`}
        >
          <input id="homepage-upload" name="homepage-upload" type="file" className="sr-only" accept="image/*,.pdf,application/pdf" onChange={(event) => void handleFiles(event.currentTarget.files)} />
          <span className="sr-only">Drag &amp; Drop Files</span>
          <span className="grid h-20 w-20 place-items-center text-white transition group-hover:scale-105">
            <ImageUp className="h-16 w-16 stroke-[1.8]" aria-hidden="true" />
          </span>
          <span className="mt-6 inline-flex items-center gap-3 rounded-lg bg-white px-7 py-4 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_16px_35px_rgba(15,23,42,0.16)] transition group-hover:-translate-y-0.5">
            Choose Files
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-6 text-xl font-bold text-white">or drop files here</span>
        </label>
      </div>

      <div className="w-full space-y-2.5">
        <WorkflowRow icon={<ImageIcon className="h-4 w-4" />} name="Image resize" detail="Target KB and dimensions" progress={progress} done={done} />
        <WorkflowRow icon={<FileType className="h-4 w-4" />} name="PDF conversion" detail="Convert, merge or compress" progress={Math.min(100, progress + 18)} done={done} />
      </div>

      <Link href="/tools" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Browse tools
      </Link>
    </div>
  );
}

function WorkflowRow({
  icon,
  name,
  detail,
  progress,
  done,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  progress: number;
  done: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <span className="shrink-0 text-xs font-semibold text-foreground">{done ? "Preview ready" : "Preparing"}</span>
        </div>
        {done ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {detail}
          </span>
        ) : (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-150" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
