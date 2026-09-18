import type { PDFFont } from "pdf-lib";
import type { EditObject } from "./model";
export type EditorFonts = Record<string, PDFFont>;
export function fontKey(o: EditObject) { return `${o.font === "Arial" ? "Helvetica" : o.font}-${o.bold ? "b" : "n"}${o.italic ? "i" : "n"}`; }
export async function loadEditorFonts() {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create(), fonts: EditorFonts = {};
  const names = [StandardFonts.Helvetica, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique,
    StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic,
    StandardFonts.Courier, StandardFonts.CourierOblique, StandardFonts.CourierBold, StandardFonts.CourierBoldOblique];
  for (const [i, family] of ["Helvetica", "Times", "Courier"].entries()) {
    for (const [j, style] of ["nn", "ni", "bn", "bi"].entries()) fonts[`${family}-${style}`] = await doc.embedFont(names[i * 4 + j]);
  }
  return fonts;
}
export function textLines(o: EditObject, font: PDFFont) {
  const lines: { text: string; width: number; x: number; baseline: number }[] = [];
  for (const paragraph of o.text.replace(/\t/g, "    ").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && font.widthOfTextAtSize(line + char, o.fontSize) > o.width - 8) { append(line); line = ""; }
      line += char;
    }
    append(line);
  }
  function append(text: string) {
    const width = font.widthOfTextAtSize(text, o.fontSize);
    lines.push({ text, width, x: o.align === "center" ? (o.width - width) / 2 : o.align === "right" ? o.width - width - 4 : 4, baseline: 4 + o.fontSize + lines.length * o.fontSize * 1.2 });
  }
  return lines.filter(line => line.baseline <= o.height);
}
