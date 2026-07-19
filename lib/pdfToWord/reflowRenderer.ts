import { HeadingLevel, ImageRun, Paragraph, TextRun } from "docx";

type ReflowItem = {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

type ReflowLine = { items: ReflowItem[]; x: number; top: number; width: number; height: number; centered: boolean; color: string };
type ReflowImage = { data: Uint8Array; width: number; height: number; top: number };

function isHeading(line: ReflowLine, medianSize: number) {
  const text = line.items.map((item) => item.text).join("").trim();
  const size = Math.max(...line.items.map((item) => item.fontSize));
  const bold = line.items.some((item) => item.bold);
  return text.length <= 120 && (size >= medianSize * 1.3 || bold && (/^[A-Z\d .&/-]+$/.test(text) || text.length < 45));
}

export function createReflowContent(pages: Array<{ lines: ReflowLine[]; images: ReflowImage[] }>) {
  const sizes = pages.flatMap((page) => page.lines).flatMap((line) => line.items.map((item) => item.fontSize)).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)] ?? 11;
  const children: Paragraph[] = [];
  for (const page of pages) {
    const blocks: Array<{ top: number; paragraph: Paragraph }> = [];
    for (const line of page.lines) {
      const text = line.items.map((item) => item.text).join("").trim();
      if (!text) continue;
      const heading = isHeading(line, medianSize);
      const bullet = /^[•●▪-]\s+/.test(text);
      blocks.push({
        top: line.top,
        paragraph: new Paragraph({
          heading: heading ? HeadingLevel.HEADING_1 : undefined,
          bullet: bullet ? { level: 0 } : undefined,
          alignment: line.centered ? "center" : "left",
          spacing: { before: heading ? 120 : 0, after: heading ? 80 : 60, line: 276, lineRule: "auto" },
          children: line.items.map((item) => new TextRun({
            text: item.text,
            font: item.fontFamily,
            size: Math.max(2, Math.round(item.fontSize * 2)),
            bold: item.bold,
            italics: item.italic,
            color: line.color,
          })),
        }),
      });
    }
    page.images.forEach((image, index) => {
      const scale = Math.min(1, 560 / (image.width * 96 / 72), 740 / (image.height * 96 / 72));
      blocks.push({ top: image.top, paragraph: new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new ImageRun({
          type: "png",
          data: image.data,
          transformation: { width: image.width * 96 / 72 * scale, height: image.height * 96 / 72 * scale },
          altText: { title: `PDF image ${index + 1}`, description: "Image extracted from the source PDF", name: `PDF image ${index + 1}` },
        })],
      }) });
    });
    blocks.sort((a, b) => a.top - b.top);
    children.push(...blocks.map((block) => block.paragraph));
  }
  return children;
}
