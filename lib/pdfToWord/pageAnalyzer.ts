export type PdfPageKind =
  | "selectable-text"
  | "scanned-image"
  | "mixed"
  | "multi-column"
  | "table-heavy"
  | "form"
  | "image-heavy"
  | "vector-heavy"
  | "simple-flowing-text";

export type PdfPageAnalysis = {
  kinds: PdfPageKind[];
  textCharacters: number;
  imageCount: number;
  vectorCount: number;
  horizontalRules: number;
  verticalRules: number;
  needsOcr: boolean;
  batchSize: number;
};

type TextLike = { str?: string; transform?: number[]; width?: number; height?: number };
type OperatorListLike = { fnArray: number[]; argsArray: unknown[][] };

export function analyzePdfPage(
  items: TextLike[], operators: OperatorListLike,
  ops: { paintImageXObject: number; paintInlineImageXObject: number; constructPath: number },
  pageWidth: number,
): PdfPageAnalysis {
  const textCharacters = items.reduce((count, item) => count + (item.str?.trim().length ?? 0), 0);
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
  const scanned = textCharacters < 8 && imageCount > 0;
  const mixed = textCharacters >= 8 && imageCount > 0;
  const tableHeavy = horizontalRules >= 3 && verticalRules >= 2;
  const form = !tableHeavy && horizontalRules >= 2 && verticalRules >= 2;
  const kinds: PdfPageKind[] = [];
  kinds.push(scanned ? "scanned-image" : mixed ? "mixed" : "selectable-text");
  if (multiColumn) kinds.push("multi-column");
  if (tableHeavy) kinds.push("table-heavy");
  if (form) kinds.push("form");
  if (imageCount >= 3) kinds.push("image-heavy");
  if (vectorCount >= 20) kinds.push("vector-heavy");
  if (!scanned && !multiColumn && !tableHeavy && vectorCount < 8) kinds.push("simple-flowing-text");

  return {
    kinds,
    textCharacters,
    imageCount,
    vectorCount,
    horizontalRules,
    verticalRules,
    needsOcr: scanned,
    batchSize: scanned ? 3 : mixed || vectorCount >= 20 ? 6 : 15,
  };
}

export function chooseBatchSize(analyses: PdfPageAnalysis[]) {
  return Math.max(3, Math.min(20, ...analyses.map((analysis) => analysis.batchSize)));
}
