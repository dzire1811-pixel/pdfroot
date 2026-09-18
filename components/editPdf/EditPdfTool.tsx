"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, CheckCircle2, Download, FilePlus2, RotateCcw, UploadCloud } from "lucide-react";
import { BrandPhrase } from "@/components/Brand";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolBySlug } from "@/lib/tools";
import { releaseNativeResources } from "@/lib/editPdf/nativeFonts";
import { readPdf } from "@/lib/editPdf/assets";
import { sizeLabel, type EditorState, type ImageAsset, type PdfSource } from "@/lib/editPdf/model";
import { loadEditorFonts, type EditorFonts } from "@/lib/editPdf/text";
import { PdfEditor } from "./PdfEditor";
import { EditPdfLandingSections } from "./EditPdfLandingSections";
import styles from "./EditPdf.module.css";

const privacy = "Review your edits before you download the completed PDF.";
export function EditPdfTool({ onEditorActiveChange, onResultActiveChange }: { onEditorActiveChange?: (active: boolean) => void; onResultActiveChange?: (active: boolean) => void }) {
  const [file, setFile] = useState<File>(), [initial, setInitial] = useState<EditorState>(), [fonts, setFonts] = useState<EditorFonts>();
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; size: number; pages: number; name: string }>();
  const sources = useRef(new Map<string, PdfSource>()), assets = useRef(new Map<string, ImageAsset>()), input = useRef<HTMLInputElement>(null);
  const url = useRef<string | undefined>(undefined), mounted = useRef(true), running = useRef(false), resultCard = useRef<HTMLElement>(null), downloading = useRef(false);
  useEffect(() => {
    mounted.current = true; const documents = sources.current, images = assets.current;
    return () => { mounted.current = false; for (const source of documents.values()) { releaseNativeResources(source); void source.pdf.loadingTask.destroy(); } documents.clear(); images.clear(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  useEffect(() => { if (result) { resultCard.current?.scrollIntoView({ block: "start" }); resultCard.current?.focus(); } }, [result]);
  useEffect(() => { onEditorActiveChange?.(Boolean(initial && !result)); return () => onEditorActiveChange?.(false); }, [initial, result, onEditorActiveChange]);
  useEffect(() => { onResultActiveChange?.(Boolean(result)); return () => onResultActiveChange?.(false); }, [result, onResultActiveChange]);
  async function upload(selected?: File) {
    if (!selected || running.current) return; running.current = true; setBusy(true); setError(""); setStatus("Opening your PDF…");
    try {
      const editorFonts = await loadEditorFonts(), loaded = await readPdf(selected);
      if (!mounted.current) { await loaded.source.pdf.loadingTask.destroy(); return; }
      sources.current.set(loaded.id, loaded.source); setFonts(editorFonts); setFile(selected); setInitial({ pages: loaded.pages, activeId: loaded.pages[0].id });
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "This PDF could not be opened. Try a smaller, unlocked copy."); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setStatus(""); } }
  }
  async function apply(state: EditorState) {
    if (running.current) return; running.current = true; setBusy(true); setError(""); setStatus("Applying edits…");
    try {
      const { exportPdf } = await import("@/lib/editPdf/exporter");
      const blob = await exportPdf(state, sources.current, assets.current, message => { if (mounted.current) setStatus(message); });
      if (!mounted.current) return;
      if (url.current) URL.revokeObjectURL(url.current); url.current = URL.createObjectURL(blob);
      setResult({ url: url.current, size: blob.size, pages: state.pages.length, name: `${file!.name.replace(/\.pdf$/i, "")}-edited.pdf` });
    } catch (error) { if (mounted.current) setError(error instanceof Error && (error.message.startsWith("Some added text") || error.message.startsWith("A compatible font")) ? error.message : "We could not export this PDF. Your edits are still here. Try fewer images or a smaller document, then apply again."); }
    finally { running.current = false; if (mounted.current) { setBusy(false); setStatus(""); } }
  }
  function reset() {
    if (!window.confirm("Start a new file? Current edits and session signatures will be cleared. Download your edited PDF first if you need it.")) return;
    setInitial(undefined); setFile(undefined); setResult(undefined); setError("");
    for (const source of sources.current.values()) { releaseNativeResources(source); void source.pdf.loadingTask.destroy(); } sources.current.clear(); assets.current.clear();
    if (url.current) URL.revokeObjectURL(url.current); url.current = undefined;
  }
  function downloadOnce(event: MouseEvent<HTMLAnchorElement>) {
    if (!downloading.current) {
      downloading.current = true;
      window.setTimeout(() => { downloading.current = false; }, 750);
      return;
    }
    event.preventDefault();
  }
  return <div className={`${styles.root} ${!initial ? styles.uploadStage : ""}`}>
    {!initial && <div className={`v0-homepage v0-tool-page ${styles.uploadScope}`} data-edit-upload-screen>
      <section data-tool-workspace-hero className="relative overflow-hidden border-b border-border bg-background px-6 pb-12 pt-10 sm:pb-14 sm:pt-12 lg:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white bg-[radial-gradient(ellipse_at_8%_14%,rgba(255,45,45,0.065)_0%,rgba(255,45,45,0.025)_24%,transparent_48%),radial-gradient(ellipse_at_92%_18%,rgba(59,130,246,0.06)_0%,rgba(59,130,246,0.022)_26%,transparent_50%),radial-gradient(ellipse_at_52%_78%,rgba(255,45,45,0.025)_0%,transparent_44%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><ToolDirectoryIcon tool={getToolBySlug("edit-pdf")!} />PDF Tools</div>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">Edit PDF Online</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Add text, images, signatures, drawings, highlights and more to your PDF.</p>
          <section id="edit-pdf-upload-tool" data-v0-managed-flow="true" className="mx-auto mt-6 max-w-full w-[min(calc(100vw-2rem),64rem)] scroll-mt-32 rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:w-[min(calc(100vw-3rem),64rem)] sm:p-6">
            <label data-primary-upload="true" htmlFor="edit-pdf-upload" onClick={e => { if (busy) e.preventDefault(); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length !== 1) { setError("Please choose one PDF at a time."); return; } void upload(e.dataTransfer.files[0]); }} className="group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-white/70 bg-[#FF2D2D] p-7 text-center transition hover:border-white hover:bg-red-600">
              <input id="edit-pdf-upload" ref={input} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="Choose PDF" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f); }} />
              <span className="mb-5 grid h-auto w-auto place-items-center bg-transparent text-white transition group-hover:scale-105"><FilePlus2 className="h-16 w-16 stroke-[1.35]" aria-hidden="true" /></span>
              <span role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} title="Choose a PDF · Up to 100 MB / 300 pages" onKeyDown={e => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }} className="mt-6 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-none transition group-hover:-translate-y-0.5">CHOOSE PDF<UploadCloud className="h-5 w-5" aria-hidden="true" /></span>
            </label>
          </section>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"><BrandPhrase text="Use PDFRoot Edit PDF to add text, images, signatures, drawings and other content directly to your PDF." styled /></p>
        </div>
      </section>
      <section className="border-b border-border bg-background px-6 py-5 lg:px-8">
        <div className="mx-auto flex max-w-[1800px] flex-wrap justify-center gap-3">
          {["One PDF at a time", "Review before download", "PDF output"].map(label => <div key={label} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>{label}</div>)}
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">{privacy}</p>
      </section>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {busy && <p className="p-3 text-center text-sm font-semibold" role="status" aria-live="polite">{status}</p>}
    {!initial && <div className="v0-homepage v0-tool-page" data-edit-landing-sections><EditPdfLandingSections /></div>}
    {initial && file && fonts && <div hidden={Boolean(result)}><PdfEditor initial={initial} file={file} sources={sources.current} assets={assets.current} fonts={fonts} busy={busy} apply={state => { void apply(state); }} reset={reset} /></div>}
    {result && <section data-edit-pdf-result data-tool-workspace-hero className={`${styles.resultHero} relative overflow-hidden border-b border-border bg-background pt-10 sm:pt-12`} tabIndex={-1} ref={resultCard} aria-label="Edited PDF result">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white bg-[radial-gradient(ellipse_at_8%_14%,rgba(255,45,45,0.065)_0%,rgba(255,45,45,0.025)_24%,transparent_48%),radial-gradient(ellipse_at_92%_18%,rgba(59,130,246,0.06)_0%,rgba(59,130,246,0.022)_26%,transparent_50%),radial-gradient(ellipse_at_52%_78%,rgba(255,45,45,0.025)_0%,transparent_44%)]" />
      <div className="relative px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><ToolDirectoryIcon tool={getToolBySlug("edit-pdf")!} />PDF Tools</div>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">Edit PDF Online</h1>
        </div>
      </div>
      <section className="relative mx-auto mt-6 max-w-full w-full scroll-mt-32 border-0 bg-transparent p-0 text-left shadow-none">
        <div data-edit-pdf-result-background className="relative min-w-0 overflow-visible bg-slate-100 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="relative min-h-0 min-w-0 bg-slate-100 px-4 py-2 text-left sm:px-6">
              <div className="transition duration-300">
                <div className="grid justify-items-center px-2 py-2 transition sm:px-4 sm:py-3">
                  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" aria-hidden="true" /></div>
                    <h2 className={`${styles.resultSuccessHeading} mt-5 text-slate-950`}>Your edited PDF is ready!</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-500">File Size: {sizeLabel(result.size)}</p>
                    <a href={result.url} download={result.name} onClick={downloadOnce} className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-none transition hover:-translate-y-0.5 hover:bg-primary/90">Download PDF<Download className="h-5 w-5" aria-hidden="true" /></a>
                    <button type="button" onClick={reset} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-red-200 hover:bg-red-50 hover:text-[#FF2D2D]">Edit Another PDF<RotateCcw className="h-5 w-5" aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>}
  </div>;
}
