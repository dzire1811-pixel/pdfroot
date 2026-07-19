export type ValidatablePage = {
  width: number;
  height: number;
  lines: Array<{ items: Array<{ text: string; x: number; top: number; width: number; height: number }> }>;
  images: Array<{ x: number; top: number; width: number; height: number }>;
};

export function validateConvertedPages(pages: ValidatablePage[], expectedPages: number, requireText: boolean) {
  if (!pages.length || pages.length !== expectedPages) throw new Error("The generated Word page count does not match the source PDF.");
  let text = "";
  for (const page of pages) {
    if (!(page.width > 0 && page.height > 0)) throw new Error("The source PDF contains an invalid page size.");
    for (const item of page.lines.flatMap((line) => line.items)) {
      text += ` ${item.text}`;
      if (![item.x, item.top, item.width, item.height].every(Number.isFinite)) throw new Error("The PDF contains invalid text coordinates.");
      if (item.x < -1 || item.top < -1 || item.x + item.width > page.width + 2 || item.top + item.height > page.height + 2) throw new Error("Converted text falls outside the source page bounds.");
    }
    for (const image of page.images) {
      if (![image.x, image.top, image.width, image.height].every(Number.isFinite) || image.width <= 0 || image.height <= 0) throw new Error("The PDF contains an invalid image placement.");
    }
  }
  if (requireText && !text.trim()) throw new Error("No reliable editable text was found in this PDF.");
}
