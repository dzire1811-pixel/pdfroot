export type ValidatablePage = {
  width: number;
  height: number;
  lines: Array<{ items: Array<{ text: string; x: number; top: number; width: number; height: number }> }>;
  images: Array<{ x: number; top: number; width: number; height: number }>;
  shapes?: Array<{ x: number; top: number; width: number; height: number }>;
  analysis?: {
    hasSelectableText: boolean;
    textCharacters: number;
    imageCount: number;
    horizontalRules: number;
    verticalRules: number;
    unicodeConfidence: number;
  };
  ocr?: { confidence: number; lowConfidenceWords: number };
};

export type ConversionQualityReport = {
  score: number;
  warning: boolean;
  signals: {
    textIntegrity: number;
    glyphCoverage: number;
    layoutPreservation: number;
    tablePreservation: number;
    imagePreservation: number;
    pageGeometry: number;
    ocrConfidence: number;
  };
  issues: string[];
};

const UNSAFE_CHARACTER = /[\uFFFD\u25A0\u25A1\u25AF\u2610\uE000-\uF8FF]/u;
const ORPHAN_MARK = /(?:^|\s)\p{Mark}/u;

export function evaluateConversionQuality(pages: ValidatablePage[]): ConversionQualityReport {
  const text = pages.flatMap((page) => page.lines.flatMap((line) => line.items.map((item) => item.text))).join(" ");
  const issues: string[] = [];
  const unsafe = UNSAFE_CHARACTER.test(text);
  const orphanMark = ORPHAN_MARK.test(text);
  if (unsafe) issues.push("Output contains replacement, private-use, or missing-glyph placeholder characters.");
  if (orphanMark) issues.push("Output contains an isolated combining mark.");
  const textIntegrity = unsafe || orphanMark ? 0 : 1;
  const glyphCoverage = unsafe ? 0 : 1;
  const pageGeometry = pages.every((page) => page.width > 0 && page.height > 0) ? 1 : 0;
  const layoutPreservation = pages.every((page) => page.lines.flatMap((line) => line.items).every((item) => item.x >= -1 && item.top >= -1
    && item.x + item.width <= page.width + 2 && item.top + item.height <= page.height + 2)) ? 1 : 0;
  const tablesExpected = pages.reduce((count, page) => count + Number((page.analysis?.horizontalRules ?? 0) >= 3 && (page.analysis?.verticalRules ?? 0) >= 2), 0);
  const tablePreservation = tablesExpected === 0 ? 1 : pages.every((page) => !page.analysis || page.analysis.horizontalRules < 3
    || page.analysis.verticalRules < 2 || (page.shapes?.length ?? 0) > 0) ? 1 : 0.5;
  const imagesExpected = pages.reduce((count, page) => count + (page.analysis?.imageCount ?? 0), 0);
  const imagePreservation = imagesExpected === 0 || pages.some((page) => page.images.length > 0) ? 1 : 0.4;
  const ocrPages = pages.filter((page) => page.ocr);
  const ocrConfidence = ocrPages.length
    ? ocrPages.reduce((sum, page) => sum + Math.max(0, Math.min(1, (page.ocr?.confidence ?? 0) / 100)), 0) / ocrPages.length
    : 1;
  if (ocrConfidence < 0.65) issues.push("Scanned text recognition confidence is low; visual content should be reviewed.");
  const unicodeConfidence = pages.length
    ? pages.reduce((sum, page) => sum + (page.analysis?.unicodeConfidence ?? 1), 0) / pages.length
    : 0;
  if (unicodeConfidence < 0.98) issues.push("The source contains incomplete or corrupt Unicode mappings; unsafe text was preserved visually.");
  const signals = { textIntegrity, glyphCoverage, layoutPreservation, tablePreservation, imagePreservation, pageGeometry, ocrConfidence };
  const score = Math.round((textIntegrity * 0.25 + glyphCoverage * 0.2 + layoutPreservation * 0.15
    + tablePreservation * 0.1 + imagePreservation * 0.1 + pageGeometry * 0.1 + ocrConfidence * 0.1) * 100);
  return { score, warning: score < 85 || issues.length > 0, signals, issues };
}

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
  const quality = evaluateConversionQuality(pages);
  if (!quality.signals.pageGeometry || !quality.signals.layoutPreservation) {
    throw new Error("The PDF could not be reconstructed safely within its original page geometry.");
  }
  if (!quality.signals.textIntegrity || !quality.signals.glyphCoverage) {
    throw new Error("The PDF contains text that cannot be written safely without changing its Unicode content.");
  }
  return quality;
}

function xmlText(xml: string) {
  if (typeof DOMParser === "undefined") return xml.replace(/<[^>]+>/g, "");
  return new DOMParser().parseFromString(xml, "application/xml").documentElement.textContent ?? "";
}

function semanticText(value: string) {
  // Word tables and tab-aligned rows may move whitespace into cell/paragraph
  // boundaries. Compare the actual Unicode characters, not serialization-only
  // spacing between OOXML nodes.
  return value.normalize("NFC").replace(/\s+/gu, "");
}

/** Post-save OOXML checks catch WPS-sensitive font slots and text corruption. */
export function validateGeneratedDocumentXml(xml: string, pages: ValidatablePage[]) {
  if (/\b(?:ascii|hAnsi|eastAsia|cs)="[A-Z0-9]{6}\+/i.test(xml)) {
    throw new Error("The Word file contains a raw PDF subset font name.");
  }
  const runFonts = [...xml.matchAll(/<w:rFonts\b[^>]*>/g)].map((match) => match[0]);
  if (runFonts.some((font) => !["ascii", "hAnsi", "eastAsia", "cs"].every((slot) => new RegExp(`w:${slot}="[^"]+"`).test(font)))) {
    throw new Error("The Word file contains an incomplete complex-script font declaration.");
  }
  const outputText = xmlText(xml).normalize("NFC");
  if (UNSAFE_CHARACTER.test(outputText) || ORPHAN_MARK.test(outputText)) {
    throw new Error("The generated Word file contains invalid or unsupported Unicode text.");
  }
  const comparableOutput = semanticText(outputText);
  const expectedSegments = pages.flatMap((page) => page.lines.flatMap((line) => line.items.map((item) => semanticText(item.text))))
    .filter(Boolean);
  const missing = expectedSegments.find((segment) => !comparableOutput.includes(segment));
  if (missing) throw new Error("The generated Word file did not preserve the reconstructed source text exactly.");
}
