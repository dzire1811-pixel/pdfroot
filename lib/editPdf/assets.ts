import { loadPdfJs } from "@/lib/pdfjsClient";
import { classifyNativePages } from "./nativeText";
import { uid, type EditorPage, type ImageAsset, type PdfSource } from "./model";

export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_PAGES = 300;
export function storeImage(assets: Map<string, ImageAsset>, asset: ImageAsset) {
  const pixels = Array.from(assets.values()).reduce((total, item) => total + item.width * item.height, asset.width * asset.height);
  if (pixels > 64_000_000) throw new Error("This editing session has too many large images. Download your PDF and start a new file to free memory.");
  const id = uid(); assets.set(id, asset); return id;
}
export async function readPdf(file: File): Promise<{ id: string; source: PdfSource; pages: EditorPage[] }> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Please choose a PDF file. Other file types are not supported.");
  if (!file.size || file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF between 1 byte and 100 MB. Split larger documents first.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  let count = 0;
  try { count = (await PDFDocument.load(bytes)).getPageCount(); } catch (error) {
    if (/encrypt|password/i.test(String(error))) throw new Error("This PDF is password-protected. Unlock it before editing.");
    throw new Error("This PDF could not be opened. It may be damaged or unsupported. Try saving a fresh copy.");
  }
  if (!count || count > MAX_PAGES) throw new Error("Please use a PDF with 1–300 pages. Split larger documents first.");
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice() });
  task.onPassword = () => { void task.destroy(); };
  let pdf;
  try { pdf = await task.promise; } catch { await task.destroy(); throw new Error("Cannot preview this PDF. Check that it is unlocked and not damaged."); }
  try {
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) throw new Error("Please use a PDF with 1–300 pages. Split larger documents first.");
    const id = uid(), pages: EditorPage[] = [];
    for (let index = 0; index < pdf.numPages; index++) {
      const page = await pdf.getPage(index + 1), viewport = page.getViewport({ scale: 1 });
      if (Math.max(viewport.width, viewport.height) > 14400) throw new Error("This PDF has unusually large page dimensions. Resize its pages before editing.");
      pages.push({ id: uid(), sourceId: id, sourceIndex: index, rotation: page.rotate, width: viewport.width, height: viewport.height, objects: [] });
    }
    const source: PdfSource = { bytes, pdf };
    void classifyNativePages(source);
    return { id, source, pages };
  } catch (error) { await pdf.loadingTask.destroy(); throw error; }
}
export async function readImage(file: File): Promise<ImageAsset> {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, JPEG or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await img.decode();
    if (!img.width || img.width * img.height > 40_000_000) throw new Error("Image dimensions are too large. Resize the image first.");
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 4096 / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch (error) { if (error instanceof Error && /large|unavailable/.test(error.message)) throw error; throw new Error("This image could not be opened. Try a PNG or JPG copy."); }
  finally { URL.revokeObjectURL(url); }
}
