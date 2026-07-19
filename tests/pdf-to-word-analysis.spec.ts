import { expect, test } from "@playwright/test";
import { analyzePdfPage, chooseBatchSize } from "../lib/pdfToWord/pageAnalyzer";

const ops = { paintImageXObject: 85, paintInlineImageXObject: 86, constructPath: 91 };

test("adaptive analyzer distinguishes scanned, column, table, and simple pages", () => {
  const scanned = analyzePdfPage([], { fnArray: [85], argsArray: [["image"]] }, ops, 612);
  expect(scanned.kinds).toContain("scanned-image");
  expect(scanned.needsOcr).toBeTruthy();
  expect(scanned.batchSize).toBe(3);

  const columns = analyzePdfPage([
    { str: "Left column has enough selectable text for analysis.", transform: [1, 0, 0, 1, 40, 700] },
    { str: "Right column has enough selectable text for analysis.", transform: [1, 0, 0, 1, 360, 700] },
  ], { fnArray: [], argsArray: [] }, ops, 612);
  expect(columns.kinds).toContain("multi-column");

  const pathArgs = (x0: number, y0: number, x1: number, y1: number) => [20, [], [x0, y0, x1, y1]];
  const table = analyzePdfPage([{ str: "Table content", transform: [1, 0, 0, 1, 40, 700] }], {
    fnArray: Array(7).fill(91),
    argsArray: [pathArgs(40, 100, 560, 100), pathArgs(40, 140, 560, 140), pathArgs(40, 180, 560, 180), pathArgs(40, 100, 40, 180), pathArgs(300, 100, 300, 180), pathArgs(560, 100, 560, 180), pathArgs(40, 220, 560, 220)],
  }, ops, 612);
  expect(table.kinds).toContain("table-heavy");
  expect(chooseBatchSize([scanned, columns, table])).toBe(3);
});
