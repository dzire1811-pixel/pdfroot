"use client";

import { CheckCircle2, Download } from "lucide-react";

type ImageResizeResultCardProps = {
  title?: string;
  originalSize: string;
  newSize: string;
  downloadUrl: string;
  fileName: string;
  onChangeFile: () => void;
};

export function ImageResizeResultCard({
  title = "Resize Complete",
  newSize,
  downloadUrl,
  fileName,
  onChangeFile,
}: ImageResizeResultCardProps) {
  return (
    <div data-v0-flow-extra="true" data-v0-result-screen="true" className="col-span-full flex min-h-[14rem] items-start justify-center px-3 pb-6 pt-3 sm:min-h-[17rem] sm:pb-8 sm:pt-5">
      <div className="w-full max-w-[620px] text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Resized to {newSize}</p>
        <a
          href={downloadUrl}
          download={fileName}
          className="mt-5 inline-flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-[#FF2D2D] px-8 text-lg font-black text-white shadow-[0_18px_40px_rgba(255,45,45,0.28)] transition hover:-translate-y-0.5 hover:bg-red-600 hover:shadow-[0_22px_48px_rgba(255,45,45,0.34)]"
        >
          Download Image
          <Download className="h-6 w-6" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={onChangeFile}
          className="mt-3 inline-flex items-center justify-center border-0 bg-transparent px-2 py-1 text-sm font-black text-[#FF2D2D] transition hover:text-red-700"
        >
          Resize Another Image
        </button>
      </div>
    </div>
  );
}
