"use client";

import { AlertTriangle, Camera, CheckCircle2, FileCheck2, Info } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { ResizeImageExactKbTool } from "@/components/ResizeImageExactKbTool";
import { SignatureResizeTool } from "@/components/SignatureResizeTool";

const photoGuidelines = [
  "Live photo must be captured on official RRB website",
  "Face clearly visible",
  "Plain background",
  "Good lighting",
  "No cap, goggles, mask",
  "Look straight at camera",
];

export function RrbPhotoSignatureHelperTool() {
  return (
    <section id="rrb-photo-signature-helper-tool" className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-5 shadow-[0_24px_70px_rgba(255,45,45,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-sm">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">RRB Photo & Signature Helper</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-red-800">
              Latest RRB forms may require live photo capture on official RRB website. This helper does not replace RRB live photo capture.
            </p>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
              Always verify latest RRB photo/signature instructions from official RRB notification.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
              <Camera className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-xl font-black text-slate-950">RRB Live Photo Guidelines</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Follow official RRB instructions while capturing or preparing application images.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {photoGuidelines.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#FF2D2D]" aria-hidden="true" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
              <FileCheck2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-xl font-black text-slate-950">What This Tool Can Help With</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">Use <BrandText styled /> for file preparation only where upload/resizing is required.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">Signature Resize</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Upload signature, resize, compress to required KB, preview, and download.</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-5 w-5 flex-none text-amber-700" aria-hidden="true" />
                <p className="text-sm font-bold leading-6 text-amber-800">
                  Latest RRB forms may require live photo capture on official RRB website. Use photo resize only where upload photo option is available.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF2D2D]">Step 1</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Resize RRB Signature</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">Prepare signature files for Railway/RRB or other government forms that ask for signature upload size limits.</p>
        </div>
        <SignatureResizeTool />
      </div>

      <div className="mt-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-center sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-700">Optional Photo Resize</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Use Only Where Photo Upload Is Available</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-6 text-amber-800">
            Latest RRB forms may require live photo capture on official RRB website. Use photo resize only where upload photo option is available.
          </p>
        </div>
        <ResizeImageExactKbTool />
      </div>
    </section>
  );
}
