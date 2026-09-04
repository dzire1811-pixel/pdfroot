import { expect, test } from "@playwright/test";
import { analyzePdfPage, chooseBatchSize } from "../lib/pdfToWord/pageAnalyzer";
import { selectPdfToWordEngine } from "../lib/pdfToWord/engine";
import { classifyDocumentRegions, type LayoutLine } from "../lib/pdfToWord/layoutAnalyzer";
import { evaluateConversionQuality } from "../lib/pdfToWord/validator";

const ops = { paintImageXObject: 85, paintInlineImageXObject: 86, constructPath: 91 };

test("adaptive analyzer distinguishes scanned, column, table, and simple pages", () => {
  const scanned = analyzePdfPage([], { fnArray: [85], argsArray: [["image"]] }, ops, 612);
  expect(scanned.kinds).toContain("scanned-image");
  expect(scanned.needsOcr).toBeTruthy();
  expect(scanned.hasSelectableText).toBeFalsy();
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
  expect(scanned.strategy).toBe("scanned-ocr");
  expect(columns.scripts).toContain("latin");
});

test("routes corrupt native mappings to reconstruction without OCR", () => {
  const page = analyzePdfPage(
    [{ str: `ગુજરાતી ${String.fromCodePoint(0xe001)}`, transform: [1, 0, 0, 1, 40, 700] }],
    { fnArray: [], argsArray: [] },
    ops,
    612,
  );
  expect(page.needsOcr).toBeFalsy();
  expect(page.strategy).toBe("native-reconstruct");
  expect(page.unicodeConfidence).toBeLessThan(1);
  expect(page.scripts).toContain("gujarati");
});

test("keeps official WPS conversion disabled without all server-side approvals", () => {
  expect(selectPdfToWordEngine().engine).toBe("internal");
  expect(() => selectPdfToWordEngine({ requested: "wpsOfficial", wpsFeatureEnabled: true }))
    .toThrow(/licensed server integration/i);
  expect(selectPdfToWordEngine({
    requested: "wpsOfficial",
    wpsFeatureEnabled: true,
    wpsCredentialsAvailable: true,
    remoteProcessingApproved: true,
  }).engine).toBe("wpsOfficial");
});

test("quality scoring independently reports text, glyph, layout, image, table, geometry, and OCR signals", () => {
  const quality = evaluateConversionQuality([{
    width: 612,
    height: 792,
    lines: [{ items: [{ text: "English हिंदी ગુજરાતી", x: 40, top: 40, width: 180, height: 14 }] }],
    images: [{ x: 300, top: 40, width: 100, height: 100 }],
    shapes: [{ x: 40, top: 100, width: 500, height: 1 }],
    analysis: { hasSelectableText: true, textCharacters: 20, imageCount: 1, horizontalRules: 3, verticalRules: 2, unicodeConfidence: 1 },
  }]);
  expect(quality.score).toBe(100);
  expect(Object.keys(quality.signals)).toEqual([
    "textIntegrity", "glyphCoverage", "layoutPreservation", "tablePreservation", "imagePreservation", "pageGeometry", "ocrConfidence",
  ]);
});

test("never OCRs pages that contain real selectable Unicode text", () => {
  for (const text of ["A", "हिंदी", "ગુજરાતી", "English हिंदी ગુજરાતી"]) {
    const page = analyzePdfPage(
      [{ str: text, transform: [1, 0, 0, 1, 40, 700] }],
      { fnArray: [85], argsArray: [["page-image"]] },
      ops,
      612,
    );
    expect(page.hasSelectableText).toBeTruthy();
    expect(page.needsOcr).toBeFalsy();
    expect(page.kinds).toContain("mixed");
  }
});

test("structured analyzer keeps label/value rows distinct from true multi-column blocks", () => {
  const line = (text: string, x: number, top: number, width: number, bold = false): LayoutLine => ({
    x, top, width, height: 12, centered: false, color: "000000",
    items: [{ text, x, width, fontSize: 10, bold, italic: false, fontFamily: "Arial" }],
  });
  const labelValues = classifyDocumentRegions({
    lines: [
      line("Name", 50, 100, 40), line(":", 180, 100, 5), line("Example Person", 195, 100, 85),
      line("Date of Birth", 50, 116, 75), line(":", 180, 116, 5), line("24 Sep 2005", 195, 116, 70),
    ],
    shapes: [], images: [], pageWidth: 612, pageHeight: 792,
  });
  expect(labelValues.regions.some((region) => region.kind === "label-value-rows" && region.rows.length === 2)).toBeTruthy();

  const twoColumns = classifyDocumentRegions({
    lines: [
      line("ADDRESS:", 50, 50, 60, true), line("CONTACT:", 320, 50, 65, true),
      line("A local address", 50, 66, 90), line("Phone : 12345", 320, 66, 80),
    ],
    shapes: [], images: [], pageWidth: 612, pageHeight: 792,
  });
  expect(twoColumns.regions.some((region) => region.kind === "multi-column" && region.rows.length === 2)).toBeTruthy();

  const labelWithIndependentRightObject = classifyDocumentRegions({
    lines: [
      line("Date :", 50, 684, 36),
      line("Place : Example", 50, 700, 99), line("Your Sincerely", 430, 700, 85),
    ],
    shapes: [], images: [], pageWidth: 612, pageHeight: 792,
  });
  expect(labelWithIndependentRightObject.regions.some((region) => region.kind === "form-fields" && region.rows.length === 1)).toBeTruthy();
  expect(labelWithIndependentRightObject.regions.some((region) => region.kind === "multi-column")).toBeTruthy();
});

test("structured analyzer atomically claims four-stroke section frames", () => {
  const heading: LayoutLine = {
    x: 50, top: 102, width: 130, height: 12, centered: false, color: "000000",
    items: [{ text: "SECTION HEADING", x: 50, width: 130, fontSize: 11, bold: true, italic: false, fontFamily: "Arial" }],
  };
  const analysis = classifyDocumentRegions({
    lines: [heading], images: [], pageWidth: 612, pageHeight: 792,
    shapes: [
      { kind: "line", x: 40, top: 100, width: 530, height: 0.5, strokeWidth: 1, strokeColor: "8064A2" },
      { kind: "line", x: 40, top: 116, width: 530, height: 0.5, strokeWidth: 2, strokeColor: "8064A2" },
      { kind: "line", x: 40, top: 100, width: 0.5, height: 16, strokeWidth: 1, strokeColor: "8064A2" },
      { kind: "line", x: 570, top: 100, width: 0.5, height: 16, strokeWidth: 1, strokeColor: "8064A2" },
    ],
  });
  const region = analysis.regions.find((candidate) => candidate.kind === "section-heading");
  expect(region?.relatedShapeIndexes).toEqual([0, 1, 2, 3]);
  expect(region).toMatchObject({ x: 40, top: 100, right: 570.5, bottom: 116.5 });
});
