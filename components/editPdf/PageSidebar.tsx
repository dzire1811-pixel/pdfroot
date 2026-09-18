import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Copy, Trash2, ChevronUp, ChevronDown, Plus, FilePlus2, X } from "lucide-react";
import type { RenderTask } from "pdfjs-dist";
import type { EditorPage, PdfSource } from "@/lib/editPdf/model";
import styles from "./EditPdf.module.css";

function Thumbnail({ page, source }: { page: EditorPage; source?: PdfSource }) {
  const ref = useRef<HTMLCanvasElement>(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setVisible(true); }, { rootMargin: "100px" });
    if (ref.current) observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !ref.current) return;
    let cancelled = false, task: RenderTask | undefined;
    const target = ref.current;
    async function render() {
      const scale = Math.min(88 / page.width, 112 / page.height) * 2;
      const buffer = document.createElement("canvas"); buffer.width = Math.ceil(page.width * scale); buffer.height = Math.ceil(page.height * scale);
      const ctx = buffer.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, buffer.width, buffer.height);
      if (source) {
        const pdfPage = await source.pdf.getPage(page.sourceIndex + 1); if (cancelled) return;
        task = pdfPage.render({ canvas: buffer, canvasContext: ctx, viewport: pdfPage.getViewport({ scale, rotation: page.rotation }) }); await task.promise;
      }
      if (!cancelled) { target.width = buffer.width; target.height = buffer.height; target.getContext("2d")?.drawImage(buffer, 0, 0); }
    }
    void render().catch(() => {});
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, source, page.width, page.height, page.rotation, page.sourceIndex]);
  return <span className={styles.thumb}><canvas ref={ref} /></span>;
}
export function PageSidebar({ pages, activeId, sources, select, action, reorder, blank, append, open, close }: {
  pages: EditorPage[]; activeId: string; sources: Map<string, PdfSource>; select: (index: number) => void;
  action: (id: string, action: "left" | "right" | "duplicate" | "delete") => void;
  reorder: (from: number, to: number) => void; blank: () => void; append: () => void; open: boolean; close: () => void;
}) {
  const dragged = useRef<number | null>(null);
  return <aside className={styles.sidebar} data-open={open} aria-label="PDF pages">
    <h2 className={styles.panelTitle}>Pages <button className={`${styles.button} ${styles.mobileClose}`} aria-label="Close pages" onClick={close}><X size={14} /></button></h2>
    {pages.map((page, index) => <div key={page.id} className={styles.pageCard} data-active={page.id === activeId} data-testid="page-card" draggable onDragStart={e => { dragged.current = index; e.dataTransfer.setData("text/plain", String(index)); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged.current !== null) reorder(dragged.current, index); dragged.current = null; }} onDragEnd={() => { dragged.current = null; }}>
      <button className={styles.pageSelect} aria-label={`Select page ${index + 1}`} aria-current={page.id === activeId ? "page" : undefined} onClick={() => select(index)}><Thumbnail page={page} source={page.sourceId ? sources.get(page.sourceId) : undefined} /><span>Page {index + 1}{page.objects.length ? ` · ${page.objects.length} edits` : ""}</span></button>
      <div className={styles.pageActions}>
        {([["left", "Rotate left", RotateCcw], ["right", "Rotate right", RotateCw], ["duplicate", "Duplicate page", Copy], ["delete", "Delete page", Trash2]] as const).map(([key, label, Icon]) => <button className={styles.button} key={key} title={`${label} ${index + 1}`} aria-label={`${label} ${index + 1}`} disabled={key === "delete" && pages.length === 1} onClick={() => action(page.id, key)}><Icon size={13} /></button>)}
        <button className={styles.button} title="Move page earlier" aria-label={`Move page ${index + 1} earlier`} disabled={index === 0} onClick={() => reorder(index, index - 1)}><ChevronUp size={13} /></button>
        <button className={styles.button} title="Move page later" aria-label={`Move page ${index + 1} later`} disabled={index === pages.length - 1} onClick={() => reorder(index, index + 1)}><ChevronDown size={13} /></button>
      </div>
    </div>)}
    <button className={styles.button} onClick={blank}><Plus size={15} />Add blank page</button>
    <button className={styles.button} onClick={append}><FilePlus2 size={15} />Add pages from PDF</button>
  </aside>;
}
