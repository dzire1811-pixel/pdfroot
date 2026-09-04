import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import { validateGujaratiText } from "../lib/pdfToWord/unicode";

const sourcePdf = process.env.PLAYWRIGHT_PDF_TO_WORD_FIXTURE ?? "C:\\Users\\Asus\\Desktop\\PRIYANSHI.pdf";
const gujaratiQuestionBankPdf = process.env.PLAYWRIGHT_GUJARATI_QUESTION_BANK_FIXTURE
  ?? path.join(process.env.USERPROFILE ?? "", "Downloads", "ધોરણ 8_ગુજરાતી પ્રશ્નબેંક_પ્રથમસત્ર_.final.pdf");
const outputDir = path.resolve("test-results", "pdf-to-word");
const fixtureDir = path.join(outputDir, "fixtures");

async function createFixturePdfs() {
  await fs.mkdir(fixtureDir, { recursive: true });
  const fontName = StandardFonts.Helvetica;

  const simple = await PDFDocument.create();
  const simpleFont = await simple.embedFont(fontName);
  const simplePage = simple.addPage([612, 792]);
  simplePage.drawText("SIMPLE_EDITABLE_MARKER", { x: 54, y: 720, size: 16, font: simpleFont, color: rgb(0.1, 0.2, 0.4) });
  simplePage.drawText("A plain paragraph remains editable and ordered.", { x: 54, y: 690, size: 11, font: simpleFont });
  await fs.writeFile(path.join(fixtureDir, "simple-text.pdf"), await simple.save());

  const columns = await PDFDocument.create();
  const columnFont = await columns.embedFont(fontName);
  const columnPage = columns.addPage([612, 792]);
  columnPage.drawText("LEFT_COLUMN_MARKER", { x: 54, y: 720, size: 12, font: columnFont });
  columnPage.drawText("RIGHT_COLUMN_MARKER", { x: 330, y: 720, size: 12, font: columnFont });
  columnPage.drawText("Left second row", { x: 54, y: 694, size: 10, font: columnFont });
  columnPage.drawText("Right second row", { x: 330, y: 694, size: 10, font: columnFont });
  await fs.writeFile(path.join(fixtureDir, "two-column.pdf"), await columns.save());

  const multipage = await PDFDocument.create();
  const multipageFont = await multipage.embedFont(fontName);
  multipage.addPage([595, 842]).drawText("PAGE_ONE_MARKER", { x: 48, y: 780, size: 14, font: multipageFont });
  multipage.addPage([842, 595]).drawText("PAGE_TWO_MARKER", { x: 48, y: 530, size: 14, font: multipageFont });
  await fs.writeFile(path.join(fixtureDir, "two-page-mixed-orientation.pdf"), await multipage.save());

  const vectors = await PDFDocument.create();
  const vectorFont = await vectors.embedFont(fontName);
  const resume = vectors.addPage([612, 792]);
  resume.drawRectangle({ x: 40, y: 40, width: 532, height: 712, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  resume.drawRectangle({ x: 54, y: 650, width: 504, height: 32, borderWidth: 2, borderColor: rgb(0.4, 0.2, 0.6) });
  resume.drawText("VECTOR_RESUME", { x: 64, y: 660, size: 12, font: vectorFont });

  const certificate = vectors.addPage([612, 792]);
  certificate.drawRectangle({ x: 36, y: 36, width: 540, height: 720, borderWidth: 3, borderColor: rgb(0.75, 0.5, 0.1) });
  certificate.drawRectangle({ x: 48, y: 48, width: 516, height: 696, borderWidth: 0.75, borderColor: rgb(0.15, 0.25, 0.5) });
  certificate.drawText("VECTOR_CERTIFICATE", { x: 190, y: 690, size: 18, font: vectorFont });

  const form = vectors.addPage([612, 792]);
  form.drawText("VECTOR_FORM", { x: 48, y: 744, size: 14, font: vectorFont });
  form.drawRectangle({ x: 48, y: 650, width: 240, height: 48, borderWidth: 1.25, borderColor: rgb(0.1, 0.4, 0.25) });
  form.drawRectangle({ x: 324, y: 650, width: 240, height: 48, borderWidth: 1.25, borderColor: rgb(0.1, 0.4, 0.25) });
  form.drawLine({ start: { x: 48, y: 610 }, end: { x: 420, y: 610 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2), dashArray: [5, 3] });
  form.drawLine({ start: { x: 300, y: 560 }, end: { x: 300, y: 640 }, thickness: 1.5, color: rgb(0.8, 0.15, 0.1) });

  const table = vectors.addPage([612, 792]);
  table.drawText("VECTOR_TABLE", { x: 48, y: 744, size: 14, font: vectorFont });
  [48, 220, 400, 564].forEach((x) => table.drawLine({ start: { x, y: 580 }, end: { x, y: 700 }, thickness: 1, color: rgb(0.1, 0.1, 0.1) }));
  [580, 620, 660, 700].forEach((y) => table.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 1, color: rgb(0.1, 0.1, 0.1) }));
  table.drawText("NAME", { x: 60, y: 676, size: 10, font: vectorFont });
  table.drawText("STATUS", { x: 232, y: 676, size: 10, font: vectorFont });
  table.drawText("PDFRoot", { x: 60, y: 636, size: 10, font: vectorFont });
  table.drawText("Ready", { x: 232, y: 636, size: 10, font: vectorFont });
  await fs.writeFile(path.join(fixtureDir, "vector-documents.pdf"), await vectors.save());

  const longBook = await PDFDocument.create();
  const longFont = await longBook.embedFont(fontName);
  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    const bookPage = longBook.addPage([612, 792]);
    bookPage.drawText(`LONG_BOOK_PAGE_${pageNumber}`, { x: 54, y: 730, size: 14, font: longFont });
    bookPage.drawText(`This is flowing selectable text on page ${pageNumber}.`, { x: 54, y: 700, size: 11, font: longFont });
  }
  await fs.writeFile(path.join(fixtureDir, "long-book-50.pdf"), await longBook.save());

  const scanSvg = Buffer.from('<svg width="1200" height="1600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="100" y="240" font-family="Arial" font-size="86" fill="black">SCANNED ENGLISH PAGE</text><text x="100" y="390" font-family="Arial" font-size="58" fill="black">Local OCR keeps this text editable.</text></svg>');
  const scanPng = await sharp(scanSvg).png().toBuffer();
  const scanPdf = await PDFDocument.create();
  const scanImage = await scanPdf.embedPng(scanPng);
  scanPdf.addPage([612, 792]).drawImage(scanImage, { x: 0, y: 0, width: 612, height: 792 });
  await fs.writeFile(path.join(fixtureDir, "scanned-english.pdf"), await scanPdf.save());

  const placedImagePdf = await PDFDocument.create();
  const placedImageFont = await placedImagePdf.embedFont(fontName);
  const placedImagePage = placedImagePdf.addPage([612, 792]);
  const placedPng = await sharp({
    create: { width: 160, height: 80, channels: 4, background: { r: 24, g: 96, b: 180, alpha: 1 } },
  }).png().toBuffer();
  const placedImage = await placedImagePdf.embedPng(placedPng);
  placedImagePage.drawText("PLACED_IMAGE_MARKER", { x: 54, y: 730, size: 12, font: placedImageFont });
  placedImagePage.drawImage(placedImage, { x: 100, y: 600, width: 80, height: 40 });
  await fs.writeFile(path.join(fixtureDir, "placed-image.pdf"), await placedImagePdf.save());

  const mixedScanSvg = Buffer.from('<svg width="1800" height="2200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="120" y="320" font-family="Nirmala UI" font-size="120" fill="black">ENGLISH LANGUAGE</text><text x="120" y="620" font-family="Nirmala UI" font-size="120" fill="black">हिंदी भाषा</text><text x="120" y="920" font-family="Nirmala UI" font-size="120" fill="black">ગુજરાતી ભાષા</text></svg>');
  const mixedScanPng = await sharp(mixedScanSvg).png().toBuffer();
  const mixedScanPdf = await PDFDocument.create();
  const mixedScanImage = await mixedScanPdf.embedPng(mixedScanPng);
  mixedScanPdf.addPage([648, 792]).drawImage(mixedScanImage, { x: 0, y: 0, width: 648, height: 792 });
  await fs.writeFile(path.join(fixtureDir, "scanned-mixed-language.pdf"), await mixedScanPdf.save());

  const unicodeFontPath = "C:\\Windows\\Fonts\\ARIALUNI.TTF";
  if (await fs.stat(unicodeFontPath).then(() => true).catch(() => false)) {
    const issuePdf = new jsPDF({ unit: "pt", format: [612, 792], compress: true });
    issuePdf.addFileToVFS("WpsIssueFont.ttf", (await fs.readFile(unicodeFontPath)).toString("base64"));
    issuePdf.addFont("WpsIssueFont.ttf", "ABC123+UnavailableIssueFont", "normal");
    issuePdf.setFont("ABC123+UnavailableIssueFont", "normal");
    issuePdf.setFontSize(13);
    issuePdf.text("WPS FONT COMPATIBILITY", 54, 70);
    const xs = [54, 220, 390, 558];
    const ys = [120, 170, 220, 270];
    xs.forEach((x) => issuePdf.line(x, ys[0], x, ys.at(-1)!));
    ys.forEach((y) => issuePdf.line(xs[0], y, xs.at(-1)!, y));
    issuePdf.text("English 123", 64, 151);
    issuePdf.text("हिंदी १२३", 230, 151);
    issuePdf.text("ગુજરાતી ૧૨૩", 400, 151);
    issuePdf.text("Mixed", 64, 201);
    issuePdf.text("हिंदी", 230, 201);
    issuePdf.text("ગુજરાતી", 400, 201);
    await fs.writeFile(path.join(fixtureDir, "wps-unicode-table.pdf"), Buffer.from(issuePdf.output("arraybuffer")));

    const gujaratiPdf = new jsPDF({ unit: "pt", format: [612, 792], compress: true });
    gujaratiPdf.addFileToVFS("GujaratiQuestionBank.ttf", (await fs.readFile(unicodeFontPath)).toString("base64"));
    gujaratiPdf.addFont("GujaratiQuestionBank.ttf", "QBANK1+UnavailableGujaratiFont", "normal");
    gujaratiPdf.setFont("QBANK1+UnavailableGujaratiFont", "normal");
    gujaratiPdf.setFontSize(14);
    gujaratiPdf.text("ધોરણ ૮ ગુજરાતી પ્રશ્નબેંક", 54, 70);
    const tableXs = [54, 190, 360, 558];
    const tableYs = [110, 160, 210, 260];
    tableXs.forEach((x) => gujaratiPdf.line(x, tableYs[0], x, tableYs.at(-1)!));
    tableYs.forEach((y) => gujaratiPdf.line(tableXs[0], y, tableXs.at(-1)!, y));

    const drawFragmentedWords = (words: string[][], x: number, y: number) => {
      let cursor = x;
      words.forEach((fragments, wordIndex) => {
        fragments.forEach((fragment) => {
          gujaratiPdf.text(fragment, cursor, y);
          cursor += gujaratiPdf.getTextWidth(fragment);
        });
        if (wordIndex < words.length - 1) cursor += 7;
      });
    };
    drawFragmentedWords([["પ્ર", "શ્ન"], ["ક્ર", "માં", "ક"]], 64, 141);
    drawFragmentedWords([["પ્ર", "કા", "ર"]], 200, 141);
    drawFragmentedWords([["સા", "રાં", "શ"]], 370, 141);
    drawFragmentedWords([["ગુ", "જ", "રા", "તી"], ["ભા", "ષા"]], 64, 191);
    drawFragmentedWords([["લ", "ખિ", "ત"], ["ઉ", "ત્ત", "ર"]], 200, 191);
    drawFragmentedWords([["વિ", "દ્યા", "ર્થી"], ["મા", "ટે"]], 370, 191);
    await fs.writeFile(path.join(fixtureDir, "gujarati-standard-8-fragments.pdf"), Buffer.from(gujaratiPdf.output("arraybuffer")));
  }
}

async function downloadEditable(page: import("@playwright/test").Page, pdfPath: string, outputName: string, mode: "fixed" | "reflow" = "fixed") {
  await page.goto("/pdf-to-word");
  await page.waitForFunction(() => {
    const input = document.querySelector("#pdf-word-upload");
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
  });
  await page.locator("#pdf-word-upload").setInputFiles(pdfPath);
  await expect(page.locator('[data-pdf-to-word-action-bar="true"]')).toBeVisible();
  if (mode === "reflow") await page.locator('[data-pdf-to-word-desktop-modes="true"]').getByText("Easy Editing", { exact: true }).click();
  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByRole("heading", { name: "Your Word file is ready!" })).toBeVisible({ timeout: 60_000 });
  const link = page.getByRole("link", { name: "Download DOCX" });
  const download = await Promise.all([page.waitForEvent("download"), link.click()]).then(([item]) => item);
  const outputPath = path.join(outputDir, outputName);
  await download.saveAs(outputPath);
  return outputPath;
}

async function documentXml(docxPath: string) {
  const archive = await JSZip.loadAsync(await fs.readFile(docxPath));
  const xml = await archive.file("word/document.xml")?.async("string");
  expect(xml, "DOCX must contain word/document.xml").toBeTruthy();
  return xml!;
}

function vectorBlocks(xml: string) {
  return [...xml.matchAll(/<v:(?:rect|shape) id="pdfroot_vector_[^>]+>/g)].map((match) => match[0]);
}

function hasVector(blocks: string[], x: number, top: number, width: number, height: number, color: string, strokeWidth: number) {
  return blocks.some((block) => block.includes(`margin-left:${x}pt;margin-top:${top}pt;width:${Math.max(0.5, width)}pt;height:${Math.max(0.5, height)}pt`)
    && block.includes(`strokecolor="#${color}"`)
    && block.includes(`strokeweight="${strokeWidth}pt"`));
}

test.beforeAll(createFixturePdfs);

async function uploadPdf(page: import("@playwright/test").Page, pdfPath = path.join(fixtureDir, "simple-text.pdf")) {
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/pdf-to-word");
  await page.waitForFunction(() => {
    const input = document.querySelector("#pdf-word-upload");
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps"));
  });
  await page.locator("#pdf-word-upload").setInputFiles(pdfPath);
  const isMobile = (page.viewportSize()?.width ?? 1440) < 640;
  if (isMobile) {
    await expect(page.locator('[data-pdf-to-word-action-bar="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "PDF to Word settings" })).toBeVisible();
  } else await expect(page.locator('[data-pdf-to-word-action-bar="true"]')).toBeVisible();
  const modeScope = isMobile ? page.getByRole("dialog", { name: "PDF to Word settings" }) : page.locator('[data-pdf-to-word-desktop-modes="true"]');
  await expect(modeScope.getByRole("radio", { name: /Keep Original Pages/ })).toBeChecked();
  const descriptions = [
    "Preserves the original page layout while keeping text editable. Large text changes may affect the layout.",
    "Creates normal Word paragraphs, headings, tables, and page flow. Page breaks and spacing may differ from the PDF.",
    "Preserves the original visual appearance. Page content may not be editable.",
  ];
  for (const description of descriptions) {
    if (isMobile) await expect(modeScope.getByText(description, { exact: true })).toBeVisible();
    else await expect(modeScope.locator(`label[title="${description}"]`)).toHaveCount(1);
  }
  if (isMobile) await page.getByRole("button", { name: "Close settings", exact: true }).click();
}

async function selectConversionMode(page: import("@playwright/test").Page, name: RegExp | string) {
  const isMobile = (page.viewportSize()?.width ?? 1440) < 640;
  if (isMobile) await page.getByRole("button", { name: "Settings", exact: true }).click();
  const modeScope = isMobile ? page.getByRole("dialog", { name: "PDF to Word settings" }) : page.locator('[data-pdf-to-word-desktop-modes="true"]');
  await modeScope.getByRole("radio", { name }).check();
  if (isMobile) await page.getByRole("button", { name: "Close settings", exact: true }).click();
}

test("desktop editable Word conversion preserves filename and creates a valid download", async ({ page }) => {
  test.skip(!(await fs.stat(sourcePdf).then(() => true).catch(() => false)), "Set PLAYWRIGHT_PDF_TO_WORD_FIXTURE to run the resume-specific conversion regression.");
  await fs.mkdir(outputDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await uploadPdf(page, sourcePdf);

  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByRole("heading", { name: "Your Word file is ready!" })).toBeVisible({ timeout: 60_000 });
  const link = page.getByRole("link", { name: "Download DOCX" });
  await expect(link).toHaveAttribute("download", "PRIYANSHI.docx");
  const download = await Promise.all([page.waitForEvent("download"), link.click()]).then(([item]) => item);
  const outputPath = path.join(outputDir, "PRIYANSHI-editable.docx");
  await download.saveAs(outputPath);

  const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
  const xml = await archive.file("word/document.xml")!.async("string");
  const source = await PDFDocument.load(await fs.readFile(sourcePdf));
  const sourcePage = source.getPage(0);
  const pageSize = xml.match(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/);
  expect(pageSize).toBeTruthy();
  expect(Number(pageSize![1])).toBeCloseTo(sourcePage.getWidth() * 20, -1);
  expect(Number(pageSize![2])).toBeCloseTo(sourcePage.getHeight() * 20, -1);
  expect(xml.match(/<w:sectPr[ >]/g)?.length).toBe(source.getPageCount());

  for (const marker of ["RESUME", "PERSONAL PROFILE", "EDUCATION", "RELEVANT SKILLS", "Experience", "DECLARATION"]) {
    expect(xml.match(new RegExp(marker, "g"))).toHaveLength(1);
  }
  const orderedMarkers = ["RESUME", "PERSONAL PROFILE", "EDUCATION", "SSC", "HSC", "B.Com.", "RELEVANT SKILLS", "Experience", "DECLARATION"];
  expect(orderedMarkers.map((marker) => xml.indexOf(marker))).toEqual([...orderedMarkers.map((marker) => xml.indexOf(marker))].sort((a, b) => a - b));
  expect(xml).not.toContain("<w:txbxContent");
  expect(xml).not.toContain("pdfroot_text_");
  expect(xml).toContain("<w:ind w:left=");

  const mediaName = Object.keys(archive.files).find((name) => /^word\/media\/.*\.png$/i.test(name));
  expect(mediaName, "Editable DOCX must retain the portrait image").toBeTruthy();
  const image = await archive.file(mediaName!)!.async("nodebuffer");
  const imageRatio = image.readUInt32BE(16) / image.readUInt32BE(20);
  const imageAnchor = xml.match(/<wp:anchor(?:(?!<\/wp:anchor>)[\s\S])*?<wp:docPr[^>]+name="PDF image 1"(?:(?!<\/wp:anchor>)[\s\S])*?<\/wp:anchor>/)?.[0];
  const extent = imageAnchor?.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
  expect(extent).toBeTruthy();
  expect(Number(extent![1]) / Number(extent![2])).toBeCloseTo(imageRatio, 2);
  expect(xml).toContain('<wp:positionH relativeFrom="page">');
  expect(xml).toContain('<wp:positionV relativeFrom="page">');
  expect(xml).toContain("<wp:posOffset>6001512</wp:posOffset>");
  expect(xml).toContain("<wp:posOffset>374904</wp:posOffset>");
  expect(xml).toContain('<wp:extent cx="1143000" cy="1539240"/>');

  // Structured sections and form fields are now editable tables rather than
  // independent paragraphs over duplicate vector frames.
  const structuredTables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]);
  for (const heading of ["PERSONAL PROFILE", "EDUCATION", "SSC", "HSC", "B.Com.", "RELEVANT SKILLS", "Experience"]) {
    const headingTables = structuredTables.filter((table) => table.includes(`>${heading}</w:t>`));
    expect(headingTables).toHaveLength(1);
    expect(headingTables[0]).toContain('<w:tblBorders>');
    expect(headingTables[0]).toContain('w:color="8064A2"');
    expect(headingTables[0]).toContain('<w:tblLayout w:type="fixed"/>');
  }
  expect(structuredTables.some((table) => table.includes('Name') && table.includes('Date of Birth'))).toBeTruthy();
  expect(xml).not.toMatch(/w:val="(?:dotted|nil)"/);
  const fontSizes = [...xml.matchAll(/<w:sz w:val="(\d+)"/g)].map((match) => Number(match[1]));
  expect(new Set(fontSizes).size).toBeGreaterThan(2);
  expect(fontSizes).toEqual(expect.arrayContaining([20, 22, 24, 36]));
  expect(xml).toContain('w:ascii="Verdana"');
  expect(xml).toMatch(/<w:b(?:\s+w:val="true")?\/>/);
  expect(xml).toContain('<w:spacing w:before="0" w:after="0"');
  expect(xml).not.toContain("<w:pgBorders");
  expect(xml).not.toContain("<w:pBdr>");
  const vectorShapes = vectorBlocks(xml);
  expect(vectorShapes.filter((shape) => shape.includes('strokecolor="#000000"') && shape.includes("width:546.86pt;height:793.46pt"))).toHaveLength(1);
  expect(vectorShapes.filter((shape) => shape.includes('strokecolor="#8064A2"'))).toHaveLength(0);
  const fixedShapes = [...xml.matchAll(/style="[^"]*margin-left:([\d.-]+)pt;margin-top:([\d.-]+)pt;width:([\d.-]+)pt;height:([\d.-]+)pt[^"]*"/g)];
  expect(fixedShapes.length).toBeGreaterThan(0);
  fixedShapes.forEach((shape) => {
    const [, x, top, width, height] = shape.map(Number);
    expect(x).toBeGreaterThanOrEqual(-1);
    expect(top).toBeGreaterThanOrEqual(-1);
    expect(x + width).toBeLessThanOrEqual(sourcePage.getWidth() + 1);
    expect(top + height).toBeLessThanOrEqual(sourcePage.getHeight() + 1);
  });
});

test("mobile preserve mode creates one full-page image Word file", async ({ page }) => {
  test.skip(!(await fs.stat(sourcePdf).then(() => true).catch(() => false)), "Set PLAYWRIGHT_PDF_TO_WORD_FIXTURE to run the resume-specific conversion regression.");
  await fs.mkdir(outputDir, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadPdf(page, sourcePdf);

  await selectConversionMode(page, "Preserve Exact Appearance");
  await page.getByRole("button", { name: "Convert to Word" }).click();
  await expect(page.getByRole("heading", { name: "Your Word file is ready!" })).toBeVisible({ timeout: 60_000 });
  const link = page.getByRole("link", { name: "Download DOCX" });
  await expect(link).toHaveAttribute("download", "PRIYANSHI.docx");
  const download = await Promise.all([page.waitForEvent("download"), link.click()]).then(([item]) => item);
  await download.saveAs(path.join(outputDir, "PRIYANSHI-preserve.docx"));
});

test("responsive action bar and mobile conversion drawer stay compact and accessible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Responsive breakpoint regression runs once.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await uploadPdf(page);

  const actionBar = page.locator('[data-pdf-to-word-action-bar="true"]');
  const desktopModes = page.locator('[data-pdf-to-word-desktop-modes="true"]');
  await expect(actionBar).toBeVisible();
  await expect(desktopModes).toBeVisible();
  await expect(page.locator('[data-pdf-to-word-desktop-settings="true"]')).toHaveCount(0);
  await expect(actionBar.getByText("Preserves the original page layout while keeping text editable. Large text changes may affect the layout.", { exact: true })).toHaveCount(0);
  const desktopBarBox = await actionBar.boundingBox();
  expect(desktopBarBox?.height).toBeLessThanOrEqual(90);
  expect(desktopBarBox?.y).toBeCloseTo(900 - (desktopBarBox?.height ?? 0), 0);
  const desktopAddBox = await actionBar.getByRole("button", { name: "Add PDF files" }).boundingBox();
  const desktopModesBox = await desktopModes.boundingBox();
  const desktopStatusBox = await actionBar.getByText("1 PDF ready", { exact: true }).boundingBox();
  expect(desktopStatusBox?.x).toBeLessThan(desktopModesBox?.x ?? 0);
  expect((desktopStatusBox?.x ?? 0) + (desktopStatusBox?.width ?? 0)).toBeLessThanOrEqual(desktopModesBox?.x ?? 0);
  expect((desktopModesBox?.x ?? 0) + (desktopModesBox?.width ?? 0)).toBeLessThanOrEqual(desktopAddBox?.x ?? 0);

  await page.setViewportSize({ width: 390, height: 844 });
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await expect(settingsButton).toBeVisible();
  await expect(desktopModes).toBeHidden();
  await expect(actionBar.getByRole("button", { name: "Clear all", exact: true })).toBeVisible();
  const mobileBarBox = await actionBar.boundingBox();
  expect(mobileBarBox?.height).toBeLessThanOrEqual(80);
  expect(mobileBarBox?.y).toBeCloseTo(844 - (mobileBarBox?.height ?? 0), 0);
  const mobileControlBoxes = await Promise.all([
    actionBar.getByRole("button", { name: "Add PDF files" }).boundingBox(),
    actionBar.getByRole("button", { name: "Convert to Word" }).boundingBox(),
    actionBar.getByRole("button", { name: "Clear all", exact: true }).boundingBox(),
  ]);
  expect(mobileControlBoxes.every((box) => box && box.y >= (mobileBarBox?.y ?? 0) && box.x >= 0 && box.x + box.width <= 390)).toBe(true);
  expect(mobileControlBoxes[0]?.x).toBeLessThan(mobileControlBoxes[1]?.x ?? 0);
  expect(mobileControlBoxes[1]?.x).toBeLessThan(mobileControlBoxes[2]?.x ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await settingsButton.click();
  const drawer = page.getByRole("dialog", { name: "PDF to Word settings" });
  await expect(drawer).toBeVisible();
  await expect(actionBar).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Clear all", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("radio")).toHaveCount(3);
  await drawer.getByRole("radio", { name: /Easy Editing/ }).check();
  await expect(drawer.getByRole("radio", { name: /Easy Editing/ })).toBeChecked();
  await drawer.getByRole("radio", { name: /Preserve Exact Appearance/ }).check();
  await expect(drawer.getByRole("radio", { name: /Preserve Exact Appearance/ })).toBeChecked();
  await drawer.getByRole("radio", { name: /Keep Original Pages/ }).check();
  await expect(drawer.getByRole("radio", { name: /Keep Original Pages/ })).toBeChecked();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");

  await drawer.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(drawer).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  await settingsButton.click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 320, height: 568 });
  const narrowBarBox = await actionBar.boundingBox();
  const narrowControlBoxes = await Promise.all([
    actionBar.getByRole("button", { name: "Add PDF files" }).boundingBox(),
    actionBar.getByRole("button", { name: "Convert to Word" }).boundingBox(),
    actionBar.getByRole("button", { name: "Clear all", exact: true }).boundingBox(),
  ]);
  expect(narrowControlBoxes.every((box) => box && box.y >= (narrowBarBox?.y ?? 0) && box.x >= 0 && box.x + box.width <= 320)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(desktopModes).toBeHidden();
  await expect(settingsButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(desktopModes).toBeVisible();
  await expect(settingsButton).toBeHidden();
});

test("generic editable conversion preserves simple, column, and multi-page structure", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Structural fixtures run once on desktop; mobile mode is covered separately.");
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));

  const simplePath = await downloadEditable(page, path.join(fixtureDir, "simple-text.pdf"), "simple-text.docx");
  const simpleXml = await documentXml(simplePath);
  expect(simpleXml.match(/SIMPLE_EDITABLE_MARKER/g)).toHaveLength(1);
  expect(simpleXml).toContain("A plain paragraph remains editable and ordered.");
  expect(simpleXml).not.toContain("<w:tbl>");

  const columnsPath = await downloadEditable(page, path.join(fixtureDir, "two-column.pdf"), "two-column.docx");
  const columnsXml = await documentXml(columnsPath);
  expect(columnsXml.match(/LEFT_COLUMN_MARKER/g)).toHaveLength(1);
  expect(columnsXml.match(/RIGHT_COLUMN_MARKER/g)).toHaveLength(1);
  expect(columnsXml).not.toContain("<w:txbxContent");
  const columnTables = [...columnsXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]);
  expect(columnTables).toHaveLength(1);
  expect(columnTables[0]).toContain('<w:gridCol w:w="5520"/>');
  expect(columnTables[0]).toContain('<w:tblLayout w:type="fixed"/>');
  const columnRows = [...columnTables[0].matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
  expect(columnRows).toHaveLength(2);
  for (const [index, markers] of [["LEFT_COLUMN_MARKER", "RIGHT_COLUMN_MARKER"], ["Left second row", "Right second row"]].entries()) {
    const cells = [...columnRows[index].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((match) => match[0]);
    expect(cells).toHaveLength(2);
    markers.forEach((marker, column) => expect(cells[column]).toContain(marker));
  }

  const multipagePath = await downloadEditable(page, path.join(fixtureDir, "two-page-mixed-orientation.pdf"), "two-page-mixed-orientation.docx");
  const multipageXml = await documentXml(multipagePath);
  expect(multipageXml.match(/PAGE_ONE_MARKER/g)).toHaveLength(1);
  expect(multipageXml.match(/PAGE_TWO_MARKER/g)).toHaveLength(1);
  expect(multipageXml.match(/<w:sectPr[ >]/g)?.length).toBe(2);
  expect(multipageXml).toContain('w:orient="landscape"');
});

test("operator-vector conversion preserves independent borders, lines, colors, and page geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Vector fixtures run once on desktop.");
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "vector-documents.pdf"), "vector-documents.docx");
  const xml = await documentXml(outputPath);

  expect(xml.match(/<w:sectPr[ >]/g)?.length).toBe(4);
  for (const marker of ["VECTOR_RESUME", "VECTOR_CERTIFICATE", "VECTOR_FORM", "VECTOR_TABLE"]) expect(xml.match(new RegExp(marker, "g"))).toHaveLength(1);
  expect(xml).not.toContain("<w:pgBorders");
  expect(xml).toContain("<w:tbl>");
  expect(xml).not.toContain("<w:pBdr>");

  const vectors = vectorBlocks(xml);
  expect(vectors.length).toBeGreaterThanOrEqual(8);
  expect(hasVector(vectors, 40, 40, 532, 712, "000000", 1)).toBeTruthy();
  expect(hasVector(vectors, 54, 110, 504, 32, "663399", 2)).toBeTruthy();
  expect(hasVector(vectors, 36, 36, 540, 720, "BF801A", 3)).toBeTruthy();
  expect(hasVector(vectors, 48, 182, 372, 0.01, "333333", 0.8)).toBeTruthy();
  expect(xml).toContain('dashstyle="dash"');
  expect(xml).not.toMatch(/id="pdfroot_text_[^"]+"[^>]+stroked="t"/);
});

test("Easy Editing mode produces flowing Word paragraphs without fixed text boxes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Reflow structure runs once on desktop.");
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "simple-text.pdf"), "simple-text-reflow.docx", "reflow");
  const xml = await documentXml(outputPath);
  expect(xml).toContain("SIMPLE_EDITABLE_MARKER");
  expect(xml).toContain("A plain paragraph remains editable and ordered.");
  expect(xml).not.toContain("pdfroot_text_");
  expect(xml).not.toContain("mso-position-horizontal-relative:page");
  expect(xml.match(/<w:p[ >]/g)?.length).toBeGreaterThanOrEqual(2);
});

test("Easy Editing reconstructs reliable populated grids as editable Word tables", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Editable table regression runs once on desktop.");
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "vector-documents.pdf"), "vector-tables-reflow.docx", "reflow");
  const xml = await documentXml(outputPath);
  expect(xml).toContain("<w:tbl>");
  for (const value of ["NAME", "STATUS", "PDFRoot", "Ready"]) expect(xml).toContain(value);
});

test("50-page selectable book preserves page count without retaining full-page editable rasters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Long-book memory regression runs once on desktop.");
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "long-book-50.pdf"), "long-book-50.docx");
  const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
  const xml = await archive.file("word/document.xml")!.async("string");
  expect(xml.match(/<w:sectPr[ >]/g)).toHaveLength(50);
  expect(xml).toContain("LONG_BOOK_PAGE_1");
  expect(xml).toContain("LONG_BOOK_PAGE_50");
  expect(Object.keys(archive.files).filter((name) => name.startsWith("word/media/"))).toHaveLength(0);
});

test("scanned English page runs local OCR and produces editable text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "OCR regression runs once on desktop.");
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "scanned-english.pdf"), "scanned-english.docx");
  const xml = await documentXml(outputPath);
  expect(xml).toContain("SCANNED ");
  expect(xml).toContain("ENGLISH ");
  expect(xml).toContain("PAGE ");
  expect(xml).not.toContain("pdfroot_text_");
  expect(xml).not.toContain("<w:txbxContent");
  expect(xml.match(/<w:p[ >]/g)?.length).toBeGreaterThanOrEqual(2);
});

test("scanned mixed-language pages keep English, Hindi, and Gujarati scripts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Mixed-language OCR regression runs once on desktop.");
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "scanned-mixed-language.pdf"), "scanned-mixed-language.docx");
  const xml = await documentXml(outputPath);
  expect(xml).toMatch(/ENGLISH/i);
  expect(xml).toMatch(/[\u0900-\u097F]/u);
  expect(xml).toMatch(/[\u0A80-\u0AFF]/u);
  expect(xml).toContain('w:val="hi-IN"');
  expect(xml).toContain('w:val="gu-IN"');
});

test("embedded images retain their PDF graphics-state coordinates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Image coordinate regression runs once on desktop.");
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, path.join(fixtureDir, "placed-image.pdf"), "placed-image.docx");
  const xml = await documentXml(outputPath);
  expect(xml).toContain("PLACED_IMAGE_MARKER");
  const anchor = xml.match(/<wp:anchor(?:(?!<\/wp:anchor>)[\s\S])*?<wp:docPr[^>]+name="PDF image 1"(?:(?!<\/wp:anchor>)[\s\S])*?<\/wp:anchor>/)?.[0];
  expect(anchor).toBeTruthy();
  expect(anchor).toContain("<wp:posOffset>1270000</wp:posOffset>");
  expect(anchor).toContain("<wp:posOffset>1930400</wp:posOffset>");
  expect(anchor).toContain('<wp:extent cx="1016000" cy="508000"/>');
});

test("WPS regression keeps subset-font table text Unicode with explicit script fonts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "WPS compatibility regression runs once on desktop.");
  const fixture = path.join(fixtureDir, "wps-unicode-table.pdf");
  test.skip(!(await fs.stat(fixture).then(() => true).catch(() => false)), "Arial Unicode fixture font is unavailable on this Windows host.");
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, fixture, "wps-unicode-table.docx", "reflow");
  const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
  const xml = await archive.file("word/document.xml")!.async("string");
  const fontTable = await archive.file("word/fontTable.xml")!.async("string");
  for (const value of ["English 123", "हिंदी", "ગુજરાતી"]) expect(xml).toContain(value);
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain('w:hRule="exact"');
  expect(xml).not.toMatch(/[A-Z0-9]{6}\+UnavailableIssueFont/i);
  expect(fontTable).not.toMatch(/[A-Z0-9]{6}\+UnavailableIssueFont/i);
  expect(fontTable).toContain('w:name="Nirmala UI"');
  for (const slot of ["ascii", "hAnsi", "eastAsia", "cs"]) expect(xml).toContain(`w:${slot}="Nirmala UI"`);
});

test("Gujarati Standard 8 table reconstructs fragmented words as valid editable Unicode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Gujarati reconstruction regression runs once on desktop.");
  const fixture = path.join(fixtureDir, "gujarati-standard-8-fragments.pdf");
  test.skip(!(await fs.stat(fixture).then(() => true).catch(() => false)), "Arial Unicode fixture font is unavailable on this Windows host.");
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, fixture, "gujarati-standard-8-fragments.docx", "reflow");
  const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
  const xml = await archive.file("word/document.xml")!.async("string");
  const fontTable = await archive.file("word/fontTable.xml")!.async("string");

  for (const value of ["ધોરણ ૮ ગુજરાતી પ્રશ્નબેંક", "પ્રશ્ન ક્રમાંક", "પ્રકાર", "સારાંશ", "ગુજરાતી ભાષા", "લખિત ઉત્તર", "વિદ્યાર્થી માટે"]) {
    expect(xml).toContain(value);
  }
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain('w:val="gu-IN"');
  expect(xml).not.toMatch(/[�□■▯☐]/u);
  const gujaratiRuns = [...xml.matchAll(/<w:t[^>]*>([^<]*[\u0A80-\u0AFF][^<]*)<\/w:t>/gu)].map((match) => match[1]);
  expect(gujaratiRuns.length).toBeGreaterThan(0);
  gujaratiRuns.forEach((text) => expect(validateGujaratiText(text)).toEqual([]));
  expect(xml).not.toMatch(/[A-Z0-9]{6}\+UnavailableGujaratiFont/i);
  expect(fontTable).not.toMatch(/[A-Z0-9]{6}\+UnavailableGujaratiFont/i);
  for (const slot of ["ascii", "hAnsi", "eastAsia", "cs"]) expect(xml).toContain(`w:${slot}="Nirmala UI"`);
});

test("supplied Gujarati question bank never emits guessed Unicode from a damaged shaped-font CMap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Question-bank architecture regression runs once on desktop.");
  test.skip(!(await fs.stat(gujaratiQuestionBankPdf).then(() => true).catch(() => false)), "Set PLAYWRIGHT_GUJARATI_QUESTION_BANK_FIXTURE to the supplied PDF.");
  test.setTimeout(600_000);
  await page.addInitScript(() => localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  const outputPath = await downloadEditable(page, gujaratiQuestionBankPdf, "gujarati-question-bank-architecture.docx");
  await expect(page.getByText(/fidelity warning/i)).toBeVisible();
  const archive = await JSZip.loadAsync(await fs.readFile(outputPath));
  const xml = await archive.file("word/document.xml")!.async("string");
  const textBoxes = xml.match(/<w:txbxContent(?:\s|>)/g)?.length ?? 0;
  const pictObjects = xml.match(/<w:pict(?:\s|>)/g)?.length ?? 0;
  const paragraphs = xml.match(/<w:p(?:\s|>)/g)?.length ?? 0;
  const textRuns = [...xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)].map((match) => match[1]);
  const visibleText = textRuns.join("\n");
  const continuousText = textRuns.join("");

  expect(textBoxes).toBe(0);
  expect(pictObjects).toBeLessThan(2000);
  expect(paragraphs).toBeLessThan(4000);
  // This source's shaped-font mapping is not reliable enough to populate an
  // editable table without inventing Gujarati text. Its table remains in the
  // visual fallback; healthy Unicode table fixtures above must stay editable.
  expect(visibleText).not.toMatch(/[�□■▯☐]/u);
  expect(visibleText).not.toContain("મ ાં");
  expect(visibleText).not.toContain("સ ર ાં શ");
  expect(continuousText).not.toContain("પૂવણ");
  expect(Object.keys(archive.files).filter((name) => /^word\/media\/.*\.png$/i.test(name)).length).toBeGreaterThan(0);
  expect(xml).not.toContain("pdfroot_text_");
});
