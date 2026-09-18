import { MousePointer2, Type, ImagePlus, Signature, Pencil, Highlighter, Shapes, Eraser, Square, Undo2, Redo2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, MoreHorizontal, Check } from "lucide-react";
import type { ToolMode } from "@/lib/editPdf/model";
import styles from "./EditPdf.module.css";
export const toolItems = [
  ["select", "Select", MousePointer2], ["text", "Text", Type], ["image", "Image", ImagePlus], ["signature", "Signature", Signature],
  ["drawing", "Draw", Pencil], ["highlight", "Highlight", Highlighter], ["shape", "Shape", Shapes], ["whiteout", "Whiteout", Eraser], ["cover", "Cover Content", Square],
] as const;
export function PdfToolbar({ tool, setTool, more, setMore, undo, redo, canUndo, canRedo, zoom, setZoom, index, count, navigate, apply }: {
  tool: ToolMode; setTool: (tool: ToolMode) => void; more: boolean; setMore: (open: boolean) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  zoom: number; setZoom: (zoom: number) => void; index: number; count: number; navigate: (index: number) => void; apply: () => void;
}) {
  return <>
    <div className={styles.toolbar} role="toolbar" aria-label="PDF editing tools" data-expanded={more}>
      {toolItems.map(([value, label, Icon], i) => <button key={value} type="button" className={styles.button} title={label} aria-label={label} aria-pressed={tool === value} data-secondary={i > 4} onClick={() => setTool(value)}><Icon size={17} aria-hidden="true" />{label}</button>)}
      <button className={`${styles.button} ${styles.more}`} title="More tools" aria-expanded={more} onClick={() => setMore(!more)}><MoreHorizontal size={17} />More</button>
    </div>
    <div className={styles.controls} aria-label="Document controls">
      <button className={styles.button} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></button>
      <button className={styles.button} title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></button>
      <span className={styles.divider} />
      <button className={styles.button} title="Zoom out" aria-label="Zoom out" disabled={zoom <= .25} onClick={() => setZoom(Math.max(.25, zoom - .25))}><ZoomOut size={16} /></button>
      <button className={styles.button} title="Fit page" onClick={() => setZoom(1)}>{zoom === 0 ? "Fit Page" : `${Math.round(zoom * 100)}%`}</button>
      <button className={styles.button} title="Fit width" onClick={() => setZoom(0)}>Fit Width</button>
      <button className={styles.button} title="Zoom in" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}><ZoomIn size={16} /></button>
      <span className={styles.divider} />
      <button className={styles.button} title="Previous page" aria-label="Previous page" disabled={index === 0} onClick={() => navigate(index - 1)}><ChevronLeft size={16} /></button>
      <span aria-live="polite">Page {index + 1} / {count}</span>
      <button className={styles.button} title="Next page" aria-label="Next page" disabled={index === count - 1} onClick={() => navigate(index + 1)}><ChevronRight size={16} /></button>
      <button className={`${styles.button} ${styles.primary} ${styles.apply}`} onClick={apply}><Check size={16} />Apply Changes</button>
    </div>
  </>;
}
