import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RenderTask } from "pdfjs-dist";
import { newObject, type EditorPage, type EditObject, type ImageAsset, type PdfSource, type ToolMode } from "@/lib/editPdf/model";
import type { EditorFonts } from "@/lib/editPdf/text";
import { ObjectGraphic } from "./ObjectGraphic";
import { NativeTextLayer } from "./NativeTextLayer";
import type { NativePage, ExistingTextEdit } from "@/lib/editPdf/nativeText";
import styles from "./EditPdf.module.css";

type Gesture = { start: [number, number]; object: EditObject; kind: "move" | "resize" | "create"; points: [number, number][] };
export function PdfCanvas({ page, source, assets, fonts, tool, settings, selected, select, commit, add, erase, zoom, native, commitNative, draftNative }: {
  native?: NativePage; commitNative: (edit: ExistingTextEdit) => void; draftNative: (edit?: ExistingTextEdit) => void;
  page: EditorPage; source?: PdfSource; assets: Map<string, ImageAsset>; fonts: EditorFonts; tool: ToolMode; settings: EditObject;
  selected?: string; select: (id?: string) => void; commit: (object: EditObject) => void; add: (object: EditObject) => void; erase: (id: string) => void; zoom: number;
}) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null), [draft, setDraft] = useState<EditObject | null>(null);
  const draftRef = useRef<EditObject | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [bounds, setBounds] = useState({ width: 600, height: 700 }), [renderStatus, setRenderStatus] = useState("");
  const scale = zoom === 0 ? Math.max(.05, (bounds.width - 40) / page.width) : Math.max(.05, Math.min((bounds.width - 40) / page.width, (bounds.height - 40) / page.height)) * zoom;
  useEffect(() => {
    const el = host.current; if (!el) return;
    const observer = new ResizeObserver(() => setBounds({ width: el.clientWidth, height: el.clientHeight })); observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    gesture.current = null; draftRef.current = null; setDraft(null);
  }, [page.id, tool]);
  useEffect(() => {
    let cancelled = false, task: RenderTask | undefined;
    setRenderStatus("Rendering page…");
    const target = canvas.current;
    async function render() {
      if (!target) return;
      // Render to a detached canvas so cancellation never races with the next render.
      const buffer = document.createElement("canvas"), ctx = buffer.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas unavailable");
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const renderScale = Math.min(scale * dpr, Math.sqrt(12_000_000 / (page.width * page.height)));
      buffer.width = Math.max(1, Math.ceil(page.width * renderScale)); buffer.height = Math.max(1, Math.ceil(page.height * renderScale));
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, buffer.width, buffer.height);
      if (source) {
        const pdfPage = await source.pdf.getPage(page.sourceIndex + 1); if (cancelled) return;
        task = pdfPage.render({ canvas: buffer, canvasContext: ctx, viewport: pdfPage.getViewport({ scale: renderScale, rotation: page.rotation }) });
        await task.promise;
      }
      if (!cancelled) { target.width = buffer.width; target.height = buffer.height; target.getContext("2d")?.drawImage(buffer, 0, 0); setRenderStatus(""); }
      buffer.width = 0; buffer.height = 0;
    }
    void render().catch(() => { if (!cancelled) setRenderStatus("This page cannot be previewed. Try another page or a fresh PDF copy."); });
    return () => { cancelled = true; task?.cancel(); };
  }, [source, page.id, page.sourceIndex, page.rotation, page.width, page.height, scale]);
  function point(event: PointerEvent): [number, number] {
    const rect = svg.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(page.width, (event.clientX - rect.left) * page.width / rect.width)), Math.max(0, Math.min(page.height, (event.clientY - rect.top) * page.height / rect.height))];
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || renderStatus || !event.isPrimary) return;
    const p = point(event), target = event.target as Element;
    const id = target.closest("[data-object-id]")?.getAttribute("data-object-id");
    const o = page.objects.find(item => item.id === id);
    if (tool === "eraser") { if (o?.type === "drawing") erase(o.id); return; }
    if (tool === "select") {
      select(o?.id);
      if (!o) {
        if (event.pointerType === "touch" && host.current) { pan.current = { x: event.clientX, y: event.clientY, left: host.current.scrollLeft, top: host.current.scrollTop }; svg.current?.setPointerCapture(event.pointerId); }
        return;
      }
      gesture.current = { start: p, object: o, kind: target.hasAttribute("data-resize") ? "resize" : "move", points: [] };
    } else if (tool === "text") {
      const width = Math.min(220, page.width), height = Math.min(72, page.height);
      add({ ...newObject("text", Math.min(p[0], page.width - width), Math.min(p[1], page.height - height), settings), width, height }); return;
    } else if (tool !== "image" && tool !== "signature") {
      const object = newObject(tool, p[0], p[1], settings);
      gesture.current = { start: p, object, kind: "create", points: [p] };
    } else return;
    svg.current?.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (pan.current && host.current) { host.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x); host.current.scrollTop = pan.current.top - (event.clientY - pan.current.y); return; }
    const g = gesture.current; if (!g) return;
    const p = point(event), dx = p[0] - g.start[0], dy = p[1] - g.start[1];
    const next = { ...g.object };
    if (g.kind === "move") { next.x += dx; next.y += dy; }
    else if (g.kind === "resize") {
      const a = -next.rotation * Math.PI / 180;
      const localX = dx * Math.cos(a) - dy * Math.sin(a), localY = dx * Math.sin(a) + dy * Math.cos(a);
      next.width = Math.max(4, next.width + localX); next.height = Math.max(4, next.height + localY);
      // Keep the rotated top-left corner anchored while resizing.
      const dw = next.width - g.object.width, dh = next.height - g.object.height, r = -a;
      next.x += (dw * Math.cos(r) - dh * Math.sin(r) - dw) / 2;
      next.y += (dw * Math.sin(r) + dh * Math.cos(r) - dh) / 2;
    } else {
      if (next.type === "drawing" && g.points.length < 10000 && Math.hypot(p[0] - g.points[g.points.length - 1][0], p[1] - g.points[g.points.length - 1][1]) > .5) g.points.push(p);
      const points = next.type === "drawing" ? g.points : [g.start, p];
      const xs = points.map(q => q[0]), ys = points.map(q => q[1]);
      next.x = Math.min(...xs); next.y = Math.min(...ys); next.width = Math.max(1, Math.max(...xs) - next.x); next.height = Math.max(1, Math.max(...ys) - next.y);
      if (next.type === "drawing") next.points = points.map(q => [(q[0] - next.x) / next.width, (q[1] - next.y) / next.height]);
      if (next.type === "shape" && ["line", "arrow"].includes(next.shape)) next.points = [g.start, p].map(q => [(q[0] - next.x) / next.width, (q[1] - next.y) / next.height]);
    }
    draftRef.current = next; setDraft(next);
  }
  function up(event: PointerEvent<SVGSVGElement>) {
    if (pan.current) { pan.current = null; if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId); return; }
    const g = gesture.current; if (!g) return;
    const final = draftRef.current;
    if (final && (g.kind !== "create" || Math.max(final.width, final.height) >= 3)) { if (g.kind === "create") add(final); else commit(final); }
    gesture.current = null; draftRef.current = null; setDraft(null); if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
  }
  const objects = page.objects.map(o => draft?.id === o.id ? draft : o);
  if (draft && !objects.some(o => o.id === draft.id)) objects.push(draft);
  return <div ref={host} className={styles.viewport} data-testid="pdf-viewport">
    <div className={styles.paper} style={{ width: page.width * scale, height: page.height * scale }}>
      <canvas ref={canvas} aria-label="Original PDF page" />
      <svg ref={svg} viewBox={`0 0 ${page.width} ${page.height}`} aria-label="PDF editing canvas" role="img" data-testid="pdf-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gesture.current = null; pan.current = null; draftRef.current = null; setDraft(null); }} style={{ cursor: tool === "select" ? "default" : "crosshair" }}>
        {native && source && <NativeTextLayer native={native} source={source} edits={page.existingTextEdits ?? []} rotation={page.rotation} enabled={tool === "select"} selected={selected} select={select} commit={commitNative} draftChanged={draftNative} />}
        {objects.map(o => <g key={o.id} data-object-id={o.id} data-object-type={o.type} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.width / 2} ${o.height / 2})`}>
          <ObjectGraphic object={o} assets={assets} fonts={fonts} />
          <rect width={o.width} height={o.height} fill="transparent" pointerEvents="all" />
          {selected === o.id && <g data-testid="object-selection"><rect width={o.width} height={o.height} fill="none" stroke="#ef4444" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} pointerEvents="none" /><rect data-resize="true" x={o.width - 5 / scale} y={o.height - 5 / scale} width={10 / scale} height={10 / scale} fill="white" stroke="#ef4444" strokeWidth={1 / scale} style={{ cursor: "nwse-resize" }} /></g>}
        </g>)}
      </svg>
      {renderStatus && <div className={styles.renderStatus} role="status">{renderStatus}</div>}
    </div>
  </div>;
}
