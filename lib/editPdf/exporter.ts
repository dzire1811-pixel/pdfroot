import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rectangle, clip, endPath, type PDFFont } from "pdf-lib";
import type { EditorState, PdfSource, ImageAsset } from "./model";
import { fontKey, loadEditorFonts, textLines } from "./text";
import { exportNativeEdits } from "./nativeExporter";

const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
export async function exportPdf(state: EditorState, sources: Map<string, PdfSource>, assets: Map<string, ImageAsset>, status: (message: string) => void) {
  const result = await PDFDocument.create(), overlays = await PDFDocument.create();
  const sourceDocs = new Map<string, PDFDocument>(), fonts = await loadEditorFonts(), embeddedFonts = new Map<string, PDFFont>();
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const [index, model] of state.pages.entries()) {
    status(`Applying edits… Page ${index + 1} of ${state.pages.length}`);
    await new Promise(resolve => setTimeout(resolve, 0));
    let target, transform = [1, 0, 0, -1, 0, model.height];
    if (model.sourceId) {
      const source = sources.get(model.sourceId)!;
      if (!sourceDocs.has(model.sourceId)) sourceDocs.set(model.sourceId, await PDFDocument.load(source.bytes));
      [target] = await result.copyPages(sourceDocs.get(model.sourceId)!, [model.sourceIndex]);
      result.addPage(target); target.setRotation(degrees(model.rotation));
      const original = await source.pdf.getPage(model.sourceIndex + 1);
      transform = original.getViewport({ scale: 1, rotation: model.rotation }).transform;
    } else { target = result.addPage([model.width, model.height]); }
    if (model.sourceId && model.existingTextEdits?.length) await exportNativeEdits(result, target, model, sources.get(model.sourceId)!);
    if (!model.objects.length) continue;
    const overlay = overlays.addPage([model.width, model.height]);
    for (const o of model.objects) {
      const angle = -o.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      const cx = o.x + o.width / 2, cy = model.height - o.y - o.height / 2;
      overlay.pushOperators(pushGraphicsState(), concatTransformationMatrix(c, s, -s, c, cx - c * o.width / 2 + s * o.height / 2, cy - s * o.width / 2 - c * o.height / 2));
      const common = { opacity: o.opacity, borderOpacity: o.opacity };
      const line = (x1: number, y1: number, x2: number, y2: number) => overlay.drawLine({ start: { x: x1, y: o.height - y1 }, end: { x: x2, y: o.height - y2 }, color: color(o.color), thickness: o.strokeWidth, opacity: o.opacity, dashArray: o.dashed ? [6, 4] : undefined });
      if (o.type === "text") {
        const key = fontKey(o);
        if (!embeddedFonts.has(key)) embeddedFonts.set(key, await overlays.embedFont(fonts[key].name));
        const font = embeddedFonts.get(key)!;
        let lines;
        try { lines = textLines(o, font); } catch { throw new Error("Some added text contains characters these fonts cannot embed. Use Latin text, or insert that text as an image."); }
        overlay.pushOperators(rectangle(0, 0, o.width, o.height), clip(), endPath());
        for (const item of lines) {
          overlay.drawText(item.text, { x: item.x, y: o.height - item.baseline, font, size: o.fontSize, color: color(o.color), opacity: o.opacity });
          if (o.underline) line(item.x, item.baseline + 2, item.x + item.width, item.baseline + 2);
        }
      } else if (o.assetId) {
        if (!images.has(o.assetId)) images.set(o.assetId, await overlays.embedPng(assets.get(o.assetId)!.data));
        overlay.drawImage(images.get(o.assetId)!, { x: 0, y: 0, width: o.width, height: o.height, opacity: o.opacity });
      } else if (o.type === "drawing") {
        const points = o.points ?? [];
        if (points.length > 1) overlay.drawSvgPath(points.map(([x, y], i) => `${i ? "L" : "M"}${x * o.width} ${y * o.height}`).join(" "), { x: 0, y: o.height, borderColor: color(o.color), borderWidth: o.strokeWidth, borderOpacity: o.opacity, borderDashArray: o.dashed ? [6, 4] : undefined });
      } else if (o.type === "shape" && (o.shape === "line" || o.shape === "arrow")) {
        const [start, end] = (o.points ?? [[0, 0], [1, 1]]).map(([x, y]) => [x * o.width, y * o.height]);
        line(start[0], start[1], end[0], end[1]);
        if (o.shape === "arrow") {
          const a = Math.atan2(end[1] - start[1], end[0] - start[0]), length = Math.min(15, Math.hypot(o.width, o.height) / 3);
          for (const offset of [-.5, .5]) line(end[0], end[1], end[0] - length * Math.cos(a + offset), end[1] - length * Math.sin(a + offset));
        }
      } else {
        const fill = o.fill === "transparent" ? undefined : color(o.fill);
        const borderWidth = o.type === "shape" ? o.strokeWidth : 0;
        const options = { color: fill, borderColor: color(o.color), borderWidth, borderDashArray: o.dashed ? [6, 4] : undefined, ...common };
        if (o.type === "shape" && o.shape === "circle") overlay.drawEllipse({ x: o.width / 2, y: o.height / 2, xScale: o.width / 2, yScale: o.height / 2, ...options });
        else overlay.drawRectangle({ x: 0, y: 0, width: o.width, height: o.height, ...options });
      }
      overlay.pushOperators(popGraphicsState());
    }
    await overlays.flush();
    const embedded = await result.embedPage(overlay);
    // Invert PDF.js's crop/rotation/UserUnit-aware viewport, then flip the overlay's Y axis.
    const [a, b, c, d, e, f] = transform, det = a * d - b * c;
    const inv = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
    target.pushOperators(pushGraphicsState(), concatTransformationMatrix(inv[0], inv[1], -inv[2], -inv[3], inv[2] * model.height + inv[4], inv[3] * model.height + inv[5]));
    target.drawPage(embedded, { x: 0, y: 0, width: model.width, height: model.height });
    target.pushOperators(popGraphicsState());
  }
  status("Preparing your PDF…");
  return new Blob([new Uint8Array(await result.save())], { type: "application/pdf" });
}
