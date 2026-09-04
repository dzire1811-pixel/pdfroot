export type PdfPageKind =
  | "selectable-text"
  | "scanned-image"
  | "mixed"
  | "multi-column"
  | "table-heavy"
  | "form"
  | "image-heavy"
  | "vector-heavy"
  | "vector-outlines"
  | "rotated-text"
  | "simple-flowing-text";

export type PdfConversionStrategy = "native-direct" | "native-reconstruct" | "scanned-ocr" | "visual-safe-fallback";

export type PdfPageAnalysis = {
  kinds: PdfPageKind[];
  textCharacters: number;
  imageCount: number;
  vectorCount: number;
  horizontalRules: number;
  verticalRules: number;
  needsOcr: boolean;
  hasSelectableText: boolean;
  scripts: Array<"latin" | "gujarati" | "devanagari" | "other">;
  unicodeConfidence: number;
  strategy: PdfConversionStrategy;
  batchSize: number;
};

type TextLike = { str?: string; transform?: number[]; width?: number; height?: number; unicodeReliable?: boolean };
type OperatorListLike = { fnArray: number[]; argsArray: unknown[][] };

export function analyzePdfPage(
  items: TextLike[], operators: OperatorListLike,
  ops: { paintImageXObject: number; paintInlineImageXObject: number; constructPath: number },
  pageWidth: number,
): PdfPageAnalysis {
  const textCharacters = items.reduce((count, item) => count + (item.str?.trim().length ?? 0), 0);
  const text = items.map((item) => item.str ?? "").join("");
  const scripts = new Set<PdfPageAnalysis["scripts"][number]>();
  if (/\p{Script=Latin}/u.test(text)) scripts.add("latin");
  if (/\p{Script=Gujarati}/u.test(text)) scripts.add("gujarati");
  if (/\p{Script=Devanagari}/u.test(text)) scripts.add("devanagari");
  if (/[^\p{Script=Latin}\p{Script=Gujarati}\p{Script=Devanagari}\p{Script=Common}\p{Script=Inherited}]/u.test(text)) scripts.add("other");
  const characters = [...text].filter((character) => !/\s/u.test(character));
  const invalidCharacters = characters.filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 0xfffd
      || codePoint >= 0xe000 && codePoint <= 0xf8ff
      || codePoint >= 0xf0000 && codePoint <= 0xffffd
      || codePoint >= 0x100000 && codePoint <= 0x10fffd;
  }).length;
  const unreliableItemCharacters = items.filter((item) => item.unicodeReliable === false)
    .reduce((count, item) => count + [...(item.str ?? "")].filter((character) => !/\s/u.test(character)).length, 0);
  const unicodeConfidence = characters.length ? Math.max(0, 1 - (invalidCharacters + unreliableItemCharacters) / characters.length) : 0;
  const imageCount = operators.fnArray.filter((op) => op === ops.paintImageXObject || op === ops.paintInlineImageXObject).length;
  let vectorCount = 0;
  let horizontalRules = 0;
  let verticalRules = 0;
  operators.fnArray.forEach((op, index) => {
    if (op !== ops.constructPath) return;
    vectorCount += 1;
    const bounds = operators.argsArray[index]?.[2] as ArrayLike<number> | undefined;
    if (!bounds || bounds.length < 4) return;
    const width = Math.abs(Number(bounds[2]) - Number(bounds[0]));
    const height = Math.abs(Number(bounds[3]) - Number(bounds[1]));
    if (width > pageWidth * 0.12 && height < 3) horizontalRules += 1;
    if (height > 12 && width < 3) verticalRules += 1;
  });

  const xPositions = items.map((item) => Number(item.transform?.[4] ?? 0)).filter(Number.isFinite).sort((a, b) => a - b);
  const middleGap = xPositions.slice(1).reduce((largest, x, index) => Math.max(largest, x - xPositions[index]), 0);
  const multiColumn = textCharacters > 80 && middleGap > pageWidth * 0.16;
  // A short caption, page number, form value, or non-Latin word is still real
  // PDF text. Sending such a page through OCR can replace exact Unicode with a
  // guess, so OCR is reserved for pages that have no selectable characters.
  const hasSelectableText = textCharacters > 0;
  const scanned = !hasSelectableText && imageCount > 0;
  const vectorOutlines = !hasSelectableText && imageCount === 0 && vectorCount >= 8;
  const mixed = hasSelectableText && imageCount > 0;
  const tableHeavy = horizontalRules >= 3 && verticalRules >= 2;
  const form = !tableHeavy && horizontalRules >= 2 && verticalRules >= 2;
  const kinds: PdfPageKind[] = [];
  if (scanned) kinds.push("scanned-image");
  else if (vectorOutlines) kinds.push("vector-outlines");
  else kinds.push(mixed ? "mixed" : "selectable-text");
  if (multiColumn) kinds.push("multi-column");
  if (tableHeavy) kinds.push("table-heavy");
  if (form) kinds.push("form");
  if (imageCount >= 3) kinds.push("image-heavy");
  if (vectorCount >= 20) kinds.push("vector-heavy");
  if (items.some((item) => Math.abs(Number(item.transform?.[1] ?? 0)) > 0.01 || Math.abs(Number(item.transform?.[2] ?? 0)) > 0.01)) kinds.push("rotated-text");
  if (!scanned && !multiColumn && !tableHeavy && vectorCount < 8) kinds.push("simple-flowing-text");

  const strategy: PdfConversionStrategy = scanned ? "scanned-ocr"
    : vectorOutlines ? "visual-safe-fallback"
      : unicodeConfidence < 0.98 ? "native-reconstruct"
        : "native-direct";
  return {
    kinds,
    textCharacters,
    imageCount,
    vectorCount,
    horizontalRules,
    verticalRules,
    needsOcr: scanned,
    hasSelectableText,
    scripts: [...scripts],
    unicodeConfidence,
    strategy,
    batchSize: scanned ? 3 : mixed || vectorCount >= 20 ? 6 : 15,
  };
}

export function chooseBatchSize(analyses: PdfPageAnalysis[]) {
  return Math.max(3, Math.min(20, ...analyses.map((analysis) => analysis.batchSize)));
}
