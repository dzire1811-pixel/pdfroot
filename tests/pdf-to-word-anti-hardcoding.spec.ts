import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("conversion engine contains no document-specific routing or text replacements", async () => {
  const root = process.cwd();
  const files = [
    "components/PdfToWordTool.tsx",
    "lib/pdfToWord/pageAnalyzer.ts",
    "lib/pdfToWord/pdfGlyphUnicode.ts",
    "lib/pdfToWord/reflowRenderer.ts",
    "lib/pdfToWord/unicode.ts",
    "lib/pdfToWord/validator.ts",
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(path.join(root, file), "utf8")))).join("\n");
  expect(source).not.toMatch(/(?:file(?:name)?|sourceName)\s*(?:===?|\.includes|\.endsWith|\.startsWith)\s*\(?["'`]/i);
  expect(source).not.toMatch(/page(?:Number|Index)\s*===?\s*\d+/);
  expect(source).not.toMatch(/\.replace\(\s*["'`]\p{Script=Gujarati}+/u);
});
