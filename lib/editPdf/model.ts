import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ExistingTextEdit, NativePage } from "./nativeText";

export type ToolMode = "select" | "text" | "image" | "signature" | "drawing" | "highlight" | "shape" | "whiteout" | "cover" | "eraser";
export type EditObject = {
  id: string; type: Exclude<ToolMode, "select" | "eraser">;
  x: number; y: number; width: number; height: number; rotation: number; opacity: number;
  color: string; fill: string; strokeWidth: number; dashed: boolean;
  text: string; font: "Helvetica" | "Arial" | "Times" | "Courier"; fontSize: number;
  bold: boolean; italic: boolean; underline: boolean; align: "left" | "center" | "right";
  shape: "rectangle" | "circle" | "line" | "arrow";
  assetId?: string; points?: [number, number][];
};
export type EditorPage = { id: string; sourceId?: string; sourceIndex: number; rotation: number; width: number; height: number; objects: EditObject[]; existingTextEdits?: ExistingTextEdit[] };
export type EditorState = { pages: EditorPage[]; activeId: string };
export type PdfSource = { bytes: Uint8Array; pdf: PDFDocumentProxy; nativePages?: Map<number, Promise<NativePage>>; pageTypes?: Map<number, NativePage['type']>; disposed?: boolean };
export type ImageAsset = { data: string; width: number; height: number };
export const uid = () => crypto.randomUUID();
export const defaults: Omit<EditObject, "id" | "type" | "x" | "y" | "width" | "height"> = {
  rotation: 0, opacity: 1, color: "#202020", fill: "transparent", strokeWidth: 2, dashed: false,
  text: "Your text", font: "Helvetica", fontSize: 18, bold: false, italic: false, underline: false, align: "left", shape: "rectangle",
};
export function newObject(type: EditObject["type"], x: number, y: number, settings = defaults): EditObject {
  return { ...settings, id: uid(), type, x, y, width: 180, height: 48,
    ...(type === "highlight" && settings === defaults ? { color: "#facc15", fill: "#facc15", opacity: .35 } : {}),
    ...(type === "whiteout" ? { color: "#ffffff", fill: "#ffffff", opacity: 1 } : {}),
    ...(type === "cover" ? { color: "#000000", fill: "#000000", opacity: 1 } : {}),
  };
}
export function rotatePage(page: EditorPage, direction: number): EditorPage {
  const clockwise = direction > 0;
  return { ...page, width: page.height, height: page.width, rotation: (page.rotation + direction + 360) % 360,
    objects: page.objects.map(o => {
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
      return { ...o, x: (clockwise ? page.height - cy : cy) - o.width / 2,
        y: (clockwise ? cx : page.width - cx) - o.height / 2, rotation: (o.rotation + direction + 360) % 360 };
    }),
  };
}
export function duplicatePage(page: EditorPage): EditorPage {
  return { ...page, id: uid(), objects: page.objects.map(o => ({ ...o, id: uid() })) };
}
export function sizeLabel(bytes: number) { return bytes > 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`; }
