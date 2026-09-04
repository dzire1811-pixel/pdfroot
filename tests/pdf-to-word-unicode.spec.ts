import { expect, test } from "@playwright/test";
import { compatibleWordFont, hasReliableUnicodeMapping, reconstructGujaratiFragments, repairIndicText, splitTextByScript, unicodeGraphemeClusters, validateGujaratiText, wordFontSlots, wordLanguageForText } from "../lib/pdfToWord/unicode";

test("preserves language identity and chooses an Indic fallback only when necessary", () => {
  expect(wordLanguageForText("English text")).toBe("en-US");
  expect(wordLanguageForText("हिंदी पाठ")).toBe("hi-IN");
  expect(wordLanguageForText("ગુજરાતી લખાણ")).toBe("gu-IN");
  expect(compatibleWordFont("Noto Sans Gujarati", "g_d0_f1", "ગુજરાતી")).toBe("Nirmala UI");
  expect(compatibleWordFont("Noto Sans Gujarati", "g_d0_f1", "ગુજરાતી", true)).toBe("Noto Sans Gujarati");
  expect(compatibleWordFont("Noto Sans Devanagari", "g_d0_f1", "हिंदी", true)).toBe("Noto Sans Devanagari");
  expect(compatibleWordFont("ABC123+Nirmala UI", "g_d0_f1", "ગુજરાતી")).toBe("Nirmala UI");
  expect(compatibleWordFont("sans-serif", "g_d0_f1", "ગુજરાતી")).toBe("Nirmala UI");
  expect(compatibleWordFont("sans-serif", "g_d0_f1", "हिंदी")).toBe("Nirmala UI");
  expect(compatibleWordFont("sans-serif", "g_d0_f1", "English")).toBe("Arial");
  expect(splitTextByScript("English 123 हिंदी ગુજરાતી").map(({ script }) => script)).toEqual(["latin", "devanagari", "gujarati"]);
  expect(wordFontSlots("Nirmala UI", "ગુજરાતી")).toEqual({ ascii: "Nirmala UI", hAnsi: "Nirmala UI", eastAsia: "Nirmala UI", cs: "Nirmala UI", hint: "cs" });
  expect(hasReliableUnicodeMapping("English हिंदी ગુજરાતી 123")).toBeTruthy();
  expect(hasReliableUnicodeMapping(`bad ${String.fromCodePoint(0xe001)} mapping`)).toBeFalsy();
});

test("reconstructs Gujarati by grapheme and geometry without artificial word spaces", () => {
  expect(unicodeGraphemeClusters("પ્રકારમાં", "gu")).toEqual(["પ્ર", "કા", "ર", "માં"]);
  expect(repairIndicText("મ ાં")).toBe("માં");
  expect(repairIndicText("સ ા ર ાં શ")).toBe("સારાંશ");

  const fragments = ["પ્ર", "કા", "ર", "માં", "સા", "રાં", "શ"].map((text, index) => ({
    text,
    x: index < 4 ? index * 8 : 42 + (index - 4) * 8,
    top: 10,
    baseline: 20,
    width: 8,
    height: 12,
    fontSize: 12,
    fontName: "g_d0_f1",
    fontFamily: "Nirmala UI",
    bold: false,
    italic: false,
  }));
  expect(reconstructGujaratiFragments(fragments).map(({ text }) => text)).toEqual(["પ્રકારમાં સારાંશ"]);
  expect(validateGujaratiText("પ્રકારમાં સારાંશ")).toEqual([]);
});

test("flags Gujarati output that would render as fragmented or missing glyphs", () => {
  expect(validateGujaratiText("ગુજરાતી �")).toContain("replacement-character");
  expect(validateGujaratiText("ગુજરાતી □")).toContain("missing-glyph-box");
  expect(validateGujaratiText("સ ર ક")).toContain("excessive-single-grapheme-fragments");
  expect(validateGujaratiText("મ ાં")).toContain("space-before-combining-mark");
});
