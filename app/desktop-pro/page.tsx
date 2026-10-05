import type { Metadata } from "next";
import "./desktop-pro.css";
import Link from "next/link";
import { ArrowRight, Check, Download, FileImage, Files, Keyboard, MonitorDown, ShieldCheck } from "lucide-react";
import { HomepageSiteHeader } from "@/components/homepage/site-header";

const downloadUrl = "https://github.com/dzire1811-pixel/pdfroot/releases/download/v0.7.0-beta.6/PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.6-x64.exe";
const installerName = "PDFRoot-Desktop-Pro-Setup-v0.7.0-beta.6-x64.exe";
const installerSha256 = "6BDE74EB4E706F7360814C4197F2C8F9D32480F602698957AA36BA025FFCAE68";

export const metadata: Metadata = {
  title: "PDFRoot Desktop Pro for Windows",
  description: "Download PDFRoot Desktop Pro Beta for 64-bit Windows 10 and 11. Work with PDF and image tools using File Explorer shortcuts.",
  alternates: { canonical: "/desktop-pro" },
  openGraph: {
    title: "PDFRoot Desktop Pro for Windows",
    description: "PDF and image tools with Windows File Explorer shortcuts.",
    url: "https://www.pdfroot.com/desktop-pro",
  },
};

const highlights = [
  { icon: Keyboard, title: "Keyboard shortcuts", text: "Select files in File Explorer and start common PDF and image tasks with a shortcut." },
  { icon: Files, title: "PDF workspace", text: "Merge, compress and convert files. Preview page order for JPG to PDF and Merge PDF." },
  { icon: FileImage, title: "Image workspace", text: "Crop, rotate and adjust images, or prepare photos for government forms." },
];
const catalogPreview = [
  { name: "Merge PDF", icon: "merge-pdf.svg" },
  { name: "JPG to PDF", icon: "jpg-to-pdf.svg" },
  { name: "Compress PDF", icon: "compress-pdf.svg" },
  { name: "PDF to JPG", icon: "pdf-to-jpg.svg" },
  { name: "Exact KB", icon: "resize-image-to-exact-kb.svg" },
  { name: "Crop Image", icon: "crop-image.svg" },
];

export default function DesktopProPage() {
  return (
    <div className="desktop-pro-page min-h-screen bg-[#f6f8fc] text-[#142039]">
      <HomepageSiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#081529] px-6 py-16 text-white sm:py-20 lg:px-8">
          <div className="pointer-events-none absolute -right-28 -top-40 h-[520px] w-[520px] rounded-full bg-red-600/25 blur-[110px]" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
            <div>
              <p className="inline-flex rounded-full border border-red-300/30 bg-red-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-red-200">PDFRoot Desktop Pro · Beta</p>
              <h1 className="mt-7 max-w-[690px] text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Your PDF workspace. <span className="text-[#ff5362]">Ready in a shortcut.</span></h1>
              <p className="mt-6 max-w-[600px] text-base leading-7 text-slate-300 sm:text-lg">PDF and image tools for your Windows desktop. Select files in File Explorer, press a shortcut and save results beside the originals.</p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                {downloadUrl ? (
                  <a href={downloadUrl} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-[#f02138] px-7 font-semibold text-white shadow-[0_14px_30px_rgba(240,33,56,0.25)] transition hover:bg-[#d9162c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400">
                    <Download className="h-5 w-5" aria-hidden="true" /> Download for Windows
                  </a>
                ) : (
                  <span className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/30 px-7 font-semibold text-slate-200">Download link being prepared</span>
                )}
                <Link href="/tools" className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-white/25 px-6 font-semibold text-white transition hover:bg-white/10">Use web tools <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
              <p className="mt-5 text-sm text-slate-300">Windows 10/11 · 64-bit (x64) · Beta 6 installer · 35 desktop tools · Approximately 112 MB</p>
            </div>
            <div className="rounded-[28px] border border-white/15 bg-white/10 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur sm:p-6">
              <div className="flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800">
                <span className="inline-flex items-center gap-2"><img src="/desktop-tool-icons/pdfroot-logo.svg" alt="" width={22} height={22} /> PDFRoot Desktop Pro</span>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs text-green-700">Auto Mode</span>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-b-xl bg-[#f8fafc] p-4 sm:grid-cols-3">
                {catalogPreview.map(({ name, icon }) => (
                  <div key={name} className="min-h-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <img className="catalog-preview-icon" src={`/desktop-tool-icons/${icon}`} alt="" width={32} height={32} />
                    <span className="text-xs font-semibold text-slate-800 sm:text-sm">{name}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-xs text-slate-300">Illustration of the desktop tool catalog</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 py-16 lg:px-8" aria-labelledby="desktop-benefits">
          <h2 id="desktop-benefits" className="text-3xl font-bold tracking-tight">Tools that stay close to your files</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-[#e21c32]"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 pb-20 lg:px-8" aria-labelledby="desktop-install">
          <div className="grid gap-8 rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm lg:grid-cols-[1fr_1fr] lg:p-10">
            <div>
              <div className="flex items-center gap-3 text-[#e21c32]"><MonitorDown className="h-7 w-7" aria-hidden="true" /><h2 id="desktop-install" className="text-2xl font-bold text-slate-900">Install and activate</h2></div>
              <ol className="mt-6 space-y-4 text-sm leading-6 text-slate-700">
                <li><strong>1.</strong> Download and run the Windows x64 installer.</li>
                <li><strong>2.</strong> Open PDFRoot Desktop Pro, enter your name and select <strong>Pay for 30 days</strong>. Existing users can open <strong>Manage License</strong> from the Windows tray icon.</li>
                <li><strong>3.</strong> Complete the ₹199 payment on Razorpay. Keep PDFRoot open while it confirms payment and automatically applies your 30-day licence.</li>
                <li><strong>4.</strong> Select files in File Explorer and use the shortcuts. Beta 5 and later check for desktop updates automatically when opened.</li>
              </ol>
              <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm leading-6 text-green-900">₹199 for 30 days on one Windows computer. Renew by making another payment through the app. Need activation or renewal help? <Link href="/contact" className="font-semibold text-green-800 underline underline-offset-2">Contact PDFRoot</Link>.</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-green-600" aria-hidden="true" /> Verify your installer</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">Download only from the link on this page. Compare the file name and SHA-256 checksum after download.</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-500">File</p>
              <code className="mt-1 block break-all text-xs text-slate-800">{installerName}</code>
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-500">SHA-256</p>
              <code className="mt-1 block break-all text-xs text-slate-800">{installerSha256}</code>
              <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" /> One licence is linked to one Windows computer.</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-600">© 2026 PDFRoot · <Link href="/privacy-policy" className="hover:text-red-600">Privacy</Link> · <Link href="/contact" className="hover:text-red-600">Support</Link></footer>
    </div>
  );
}
