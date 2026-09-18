import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees, rgb, PDFName, PDFNumber } from "pdf-lib";
import { PNG } from "pngjs";
import fs from "node:fs/promises";
import path from "node:path";
import { stubLocalSpeedInsights } from "./playwright-local-telemetry";
import { waitForEditorLayout } from "./edit-pdf-layout";

async function fixture(rotated = false) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([500, 700]);
  first.drawText("ORIGINAL_FORM_CONTENT", { x: 60, y: 590, size: 14, font });
  first.drawRectangle({ x: 65, y: 380, width: 45, height: 30, color: rgb(.1, .2, .8) });
  if (rotated) { first.setCropBox(40, 60, 400, 580); first.setRotation(degrees(90)); first.node.set(PDFName.of("UserUnit"), PDFNumber.of(1.25)); }
  const second = pdf.addPage([600, 400]); second.drawText("SECOND_PAGE", { x: 50, y: 250, font });
  return { name: "form.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
}
const solidImage = () => {
  const png = new PNG({ width: 120, height: 60 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 25; png.data[i + 1] = 150; png.data[i + 2] = 70; png.data[i + 3] = 255; }
  return { name: "stamp.png", mimeType: "image/png", buffer: PNG.sync.write(png) };
};
async function openEditor(page: Page, rotated = false) {
  await stubLocalSpeedInsights(page);
  await page.goto("/edit-pdf");
  const reject = page.getByRole("button", { name: "Reject non-essential" }); if (await reject.isVisible()) await reject.click();
  await expect(page.getByRole("heading", { name: "Edit PDF Online", exact: true })).toBeVisible();
  await page.getByLabel("Choose PDF", { exact: true }).setInputFiles(await fixture(rotated));
  await expect(page.getByRole("region", { name: "PDF editor workspace" })).toBeVisible();
  await expect(page.getByText("Rendering page…", { exact: true })).toHaveCount(0);
}
async function hideProperties(page: Page) {
  const close = page.getByRole("button", { name: "Close properties", exact: true }); if (await close.isVisible()) await close.click();
}
async function pagesDrawer(page: Page) {
  const open = page.getByRole("button", { name: "Pages", exact: true }); if (await open.isVisible() && await open.getAttribute("aria-expanded") !== "true") await open.click();
}
async function tool(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible())) await page.getByRole("button", { name: "More", exact: true }).click();
  await button.click();
}
async function draw(page: Page, x = .2, y = .35, width = .25, height = .1) {
  await hideProperties(page);
  await waitForEditorLayout(page);
  await expect(page.getByText("Rendering page…", { exact: true })).toHaveCount(0);
  const box = (await page.getByTestId("pdf-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * (x + width), box.y + box.height * (y + height), { steps: 8 }); await page.mouse.up();
}
async function inspectPdf(page: Page, bytes: Buffer, samples: { page: number; x: number; y: number }[] = []) {
  await page.route("**/__edit_test_pdfjs.mjs", route => route.fulfill({ path: path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs"), contentType: "application/javascript" }));
  return page.evaluate(async ({ data, samples }) => {
    const moduleUrl = "/__edit_test_pdfjs.mjs", pdfjs = await import(moduleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ data: Uint8Array.from(data) }), doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i), v = p.getViewport({ scale: 1 }), text = await p.getTextContent();
      const c = document.createElement("canvas"); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height); const ctx = c.getContext("2d")!;
      await p.render({ canvas: c, canvasContext: ctx, viewport: v }).promise;
      const pixels = samples.filter(s => s.page === i).map(s => Array.from(ctx.getImageData(Math.round(s.x), Math.round(s.y), 1, 1).data));
      pages.push({ width: v.width, height: v.height, text: text.items.map((item: { str?: string }) => item.str ?? "").join(" "), pixels });
    }
    await task.destroy(); return pages;
  }, { data: Array.from(bytes), samples });
}
async function downloadResult(page: Page) {
  await expect(page.getByRole("heading", { name: "Your edited PDF is ready!" })).toBeVisible();
  const pending = page.waitForEvent("download"); await page.getByRole("link", { name: "Download PDF" }).click(); const download = await pending;
  expect(download.suggestedFilename()).toBe("form-edited.pdf");
  return fs.readFile((await download.path())!);
}

test("upload guide, editor handoff, and result filename work on every viewport", async ({ page }) => {
  await stubLocalSpeedInsights(page);
  await page.goto("/edit-pdf");
  const reject = page.getByRole("button", { name: "Reject non-essential" }); if (await reject.isVisible()) await reject.click();
  await expect(page.getByRole("heading", { name: "How Edit PDF Online works", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions about this tool", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example", exact: true })).toBeVisible();
  await expect(page.getByText("Can I edit text already in a PDF?", { exact: true })).toBeVisible();
  const relatedTools = page.locator('[data-tool-page-extra="related"]');
  await expect(relatedTools.getByRole("heading", { name: "More PDF Tools", exact: true })).toBeVisible();
  for (const [name, href] of [["Merge PDF", "/merge-pdf"], ["Compress PDF", "/compress-pdf"], ["Split PDF", "/split-pdf"], ["PDF to Word", "/pdf-to-word"], ["PDF to Excel", "/pdf-to-excel"], ["PDF to PowerPoint", "/pdf-to-powerpoint"]]) {
    await expect(relatedTools.getByRole("link", { name, exact: false })).toHaveAttribute("href", href);
  }
  await expect(page.locator('img[src="/icons/tools/edit-pdf.svg"]')).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  const source = await fixture();
  await page.getByLabel("Choose PDF", { exact: true }).setInputFiles({ ...source, name: "Online Payment Receipt.pdf" });
  await expect(page.getByRole("region", { name: "PDF editor workspace" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await expect(page.locator('[data-edit-landing-sections]')).toHaveCount(0);
  await expect(page.getByText("Why Choose PDFRoot?", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Was this tool helpful?", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Edit PDF Online", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your edited PDF is ready!", exact: true })).toBeVisible();
  await expect(page.getByText(/^File Size: \d+(?:\.\d+)? (?:KB|MB)$/)).toBeVisible();
  await expect(page.getByText("Online Payment Receipt-edited.pdf", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Another PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Another PDF", exact: true })).toHaveCSS("font-weight", "600");
  await expect(page.getByRole("heading", { name: "Was this tool helpful?", exact: true })).toBeVisible();
  await expect(page.getByLabel("Optional feedback", { exact: true })).toBeVisible();
  const nextActions = page.locator('[data-edit-pdf-result-only="next-actions"]');
  await expect(nextActions.getByRole("heading", { name: "What would you like to do next?", exact: true })).toBeVisible();
  await expect(nextActions.getByRole("link", { name: "Explore All PDF Tools", exact: true })).toHaveAttribute("href", "/#pdf-tools");
  await expect(page.getByText("Why Choose PDFRoot?", { exact: true })).toBeVisible();
  const downloadLink = page.getByRole("link", { name: "Download PDF", exact: true });
  await expect(downloadLink).toHaveAttribute("download", "Online Payment Receipt-edited.pdf");
  const firstDownload = page.waitForEvent("download");
  await downloadLink.click();
  await firstDownload;
  const duplicateDownload = page.waitForEvent("download", { timeout: 500 }).then(() => true).catch(() => false);
  await downloadLink.click();
  expect(await duplicateDownload).toBe(false);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  const resultOrder = await page.evaluate(() => {
    const labels = ["Your edited PDF is ready!", "Was this tool helpful?", "What would you like to do next?", "Built for everyday PDF and image work"];
    const headings = labels.map(label => Array.from(document.querySelectorAll("h1,h2,h3")).find(node => node.textContent?.trim() === label));
    return [...headings, document.querySelector("footer")].every((node, index, nodes) => {
      if (!node) return false;
      return index === 0 || Boolean((nodes[index - 1]?.compareDocumentPosition(node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });
  expect(resultOrder).toBe(true);
});

test("Edit PDF result typography and full-width background match Merge PDF", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const widths = testInfo.project.name.startsWith("mobile") ? [390] : [1366, 1920, 768, 390];
  async function measureResults(headingText: string) {
    const measurements = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      const heading = page.getByRole("heading", { name: headingText, exact: true });
      await expect(heading).toBeVisible();
      const geometry = await heading.evaluate(element => {
        const card = element.parentElement!;
        const textStyle = (node: Element) => {
          const style = getComputedStyle(node);
          return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
            lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
            marginTop: style.marginTop, marginBottom: style.marginBottom };
        };
        const rect = (node: Element) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        const backgrounds = [];
        for (let node = card.parentElement; node; node = node.parentElement) {
          if (getComputedStyle(node).backgroundColor === "rgb(241, 245, 249)") backgrounds.push(rect(node));
        }
        const metadata = element.nextElementSibling!;
        return {
          heading: textStyle(element), headingBox: rect(element), card: rect(card),
          // The outermost gray ancestor is the visible result section, not the constrained card wrapper.
          background: backgrounds.at(-1)!,
          belowHeading: metadata.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
          metadata: textStyle(metadata),
          download: textStyle(card.querySelector("a")!),
          secondary: textStyle(card.querySelector("button")!),
          downloadColor: getComputedStyle(card.querySelector("a")!).backgroundColor,
          downloadShadow: getComputedStyle(card.querySelector("a")!).boxShadow,
          viewport: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      // Merge's existing <=640px rule adds section padding; do not copy that
      // mobile gutter or change another tool. Edit must be full bleed at every width.
      if (headingText.includes("edited") || width > 640) {
        expect(geometry.background.left).toBeCloseTo(0, 1);
        expect(geometry.background.right).toBeCloseTo(geometry.viewport, 1);
      }
      expect(geometry.card.left + geometry.card.width / 2).toBeCloseTo(geometry.viewport / 2, 1);
      expect(geometry.scrollWidth).toBe(geometry.viewport);
      expect(geometry.card.top - geometry.background.top).toBeLessThanOrEqual(24);
      expect(geometry.background.bottom - geometry.card.bottom).toBeLessThanOrEqual(24);
      expect(geometry.headingBox.height).toBeCloseTo(parseFloat(geometry.heading.lineHeight), 1);
      await testInfo.attach(`${headingText.includes("edited") ? "edit" : "merge"}-result-${width}`, {
        body: await page.screenshot(), contentType: "image/png",
      });
      measurements.push(geometry);
    }
    return measurements;
  }
  await openEditor(page);
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Your edited PDF is ready!", exact: true })).toBeVisible();
  const editGeometry = await measureResults("Your edited PDF is ready!");

  await page.goto("/merge-pdf");
  await page.locator("#merge-pdf-upload").setInputFiles([await fixture(), await fixture()]);
  await expect(page.locator('[data-workflow-step="arrange"]')).toBeVisible();
  await page.locator('[data-merge-action-bar="true"]').getByRole("button", { name: "Merge PDF", exact: true }).click();
  await expect(page.locator('[data-workflow-step="download"]')).toBeVisible({ timeout: 30_000 });
  const mergeGeometry = await measureResults("Your PDF is ready!");
  for (const [index, edit] of editGeometry.entries()) {
    const merge = mergeGeometry[index];
    expect(edit.heading).toEqual(merge.heading);
    expect(edit.belowHeading).toBe(merge.belowHeading);
    if (widths[index] > 640) {
      expect(edit.background.left).toBe(merge.background.left);
      expect(edit.background.right).toBe(merge.background.right);
      expect(edit.card.top - edit.background.top).toBeCloseTo(merge.card.top - merge.background.top, 1);
      expect(edit.background.bottom - edit.card.bottom).toBeCloseTo(merge.background.bottom - merge.card.bottom, 1);
    }
    expect(edit.downloadColor).toBe(merge.downloadColor);
    // Tailwind shadow-none serializes as transparent zero-size shadows; Merge's
    // shared override serializes as "none". Both must have no visible shadow.
    for (const shadow of [edit.downloadShadow, merge.downloadShadow]) {
      expect(shadow === "none" || shadow.split(", rgba").every(part => part.endsWith("0px 0px 0px 0px"))).toBe(true);
    }
    for (const property of ["fontFamily", "fontSize", "fontWeight", "letterSpacing"] as const) {
      expect(edit.metadata[property]).toBe(merge.metadata[property]);
    }
    // Compare computed typography, not the raw font-black class overridden on Merge.
    for (const button of ["download", "secondary"] as const) {
      for (const property of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"] as const) {
        expect(edit[button][property], `${button} ${property} at ${widths[index]}px`).toBe(merge[button][property]);
      }
    }
    // Preserve Edit's existing card width, including on mobile.
    expect(edit.card.width).toBe(widths[index] === 390 ? 294 : 576);
  }
});

test("upload, text, undo/redo, export and download preserve original text locally", async ({ page }) => {
  const errors: string[] = [], outgoing: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openEditor(page);
  page.on("request", request => { if (["POST", "PUT"].includes(request.method())) outgoing.push(request.url()); });
  await expect(page).toHaveTitle("Edit PDF Online - Add Text, Images & Signatures | PDFRoot");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://www.pdfroot.com/edit-pdf");
  await tool(page, "Text"); await hideProperties(page);
  await page.getByTestId("pdf-canvas").click({ position: { x: 55, y: 65 } });
  await page.getByLabel("Text content").fill("Added by PDFRoot");
  await page.getByLabel("Text content").blur();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("pdf-canvas")).toContainText("Your text");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-object-type="text"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("pdf-canvas")).toContainText("Added by PDFRoot");
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  const bytes = await downloadResult(page), pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2); expect(pdf.getPage(0).getSize()).toEqual({ width: 500, height: 700 });
  const inspected = await inspectPdf(page, bytes);
  expect(inspected[0].text).toContain("ORIGINAL_FORM_CONTENT"); expect(inspected[0].text).toContain("Added by PDFRoot");
  expect(outgoing).toEqual([]); expect(errors).toEqual([]);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Edit Another PDF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit PDF Online", exact: true })).toBeVisible();
});

test("images, all signature modes, whiteout, drawing, cover and shapes export", async ({ page }) => {
  await openEditor(page);
  await page.getByLabel("Upload image", { exact: true }).setInputFiles(solidImage());
  await expect(page.locator('[data-object-type="image"]')).toHaveCount(1);
  await tool(page, "Signature"); await page.getByRole("button", { name: "Type", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Sample Signer"); await page.getByLabel("Save signature for this session").check(); await page.getByRole("button", { name: "Insert signature" }).click();
  await expect(page.locator('[data-object-type="signature"]')).toHaveCount(1);
  await tool(page, "Signature"); await page.getByRole("button", { name: "Use saved signature" }).click();
  await expect(page.locator('[data-object-type="signature"]')).toHaveCount(2);
  await tool(page, "Signature"); await page.getByRole("button", { name: "Upload", exact: true }).click(); await page.getByLabel("Upload PNG/JPG signature").setInputFiles(solidImage());
  await expect(page.locator('[data-object-type="signature"]')).toHaveCount(3);
  await tool(page, "Signature");
  const pad = (await page.getByLabel("Signature drawing pad").boundingBox())!;
  await page.mouse.move(pad.x + 30, pad.y + 50); await page.mouse.down(); await page.mouse.move(pad.x + 120, pad.y + 90, { steps: 10 }); await page.mouse.up();
  await page.getByRole("button", { name: "Insert signature" }).click(); await expect(page.locator('[data-object-type="signature"]')).toHaveCount(4);
  for (const [label, type] of [["Whiteout", "whiteout"], ["Draw", "drawing"], ["Highlight", "highlight"], ["Shape", "shape"], ["Cover Content", "cover"]]) {
    await tool(page, label); await draw(page); await expect(page.locator(`[data-object-type="${type}"]`)).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  const bytes = await downloadResult(page); expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  const inspected = await inspectPdf(page, bytes); expect(inspected[0].text).toContain("ORIGINAL_FORM_CONTENT");
});

test("page operations, keyboard edits and zoom keep overlays aligned on cropped rotated pages", async ({ page }) => {
  await openEditor(page, true);
  await tool(page, "Shape");
  await page.getByLabel("Fill", { exact: true }).fill("#ff0000");
  await draw(page, .2, .3, .2, .15);
  const before = await page.locator('[data-object-type="shape"]').getAttribute("transform");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await page.locator('[data-object-type="shape"]').getAttribute("transform")).toBe(before);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("Control+z");
  expect(await page.locator('[data-object-type="shape"]').getAttribute("transform")).toBe(before);
  await pagesDrawer(page); await page.getByRole("button", { name: "Rotate right 1", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate page 1", exact: true }).click();
  await expect(page.getByText("Page 2 / 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move page 2 earlier", exact: true }).click();
  await page.getByRole("button", { name: "Delete page 2", exact: true }).click();
  await page.getByRole("button", { name: "Add blank page", exact: true }).click();
  await page.getByLabel("Append PDF", { exact: true }).setInputFiles(await fixture());
  await expect(page.getByText("Page 4 / 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  const bytes = await downloadResult(page), pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(5); expect(pdf.getPage(0).getRotation().angle).toBe(180);
  expect(pdf.getPage(0).getCropBox()).toEqual({ x: 40, y: 60, width: 400, height: 580 });
  // Original visual center (.3 * 725, .375 * 500) rotates clockwise to (312.5, 217.5).
  const inspected = await inspectPdf(page, bytes, [{ page: 1, x: 312, y: 217 }]);
  expect(inspected[0].width).toBe(500); expect(inspected[0].height).toBe(725);
  expect(inspected[0].pixels[0].slice(0, 3)).toEqual([255, 0, 0]);
});

test("invalid files, protected PDFs, empty documents and unsupported text fail clearly", async ({ page }) => {
  await page.goto("/edit-pdf");
  const input = page.getByLabel("Choose PDF", { exact: true });
  const alert = page.locator('p[role="alert"]');
  await input.setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await expect(alert).toContainText("Please choose a PDF");
  await input.setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 broken") }); await expect(alert).toContainText("damaged");
  const empty = await PDFDocument.create(); await input.setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.from(await empty.save({ addDefaultPage: false })) }); await expect(alert).toContainText("1–300 pages");
  const locked = await PDFDocument.create(); locked.addPage(); locked.context.trailerInfo.Encrypt = locked.context.register(locked.context.obj({ Filter: PDFName.of("Standard"), V: 1, R: 2, P: -4 }));
  await input.setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: Buffer.from(await locked.save()) }); await expect(alert).toContainText("password-protected");
  await openEditor(page); await tool(page, "Text"); await hideProperties(page); await page.getByTestId("pdf-canvas").click({ position: { x: 35, y: 40 } }); await page.getByLabel("Text content").fill("ગુજરાતી");
  await page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true }).click();
  await expect(alert).toContainText("characters these fonts cannot embed"); await expect(page.getByRole("region", { name: "PDF editor workspace" })).toBeVisible();
});

test("workspace fits all requested viewports without sidebars overlapping the PDF", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(120000);
  await openEditor(page);
  for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const viewport = (await page.getByTestId("pdf-viewport").boundingBox())!;
    const paper = (await page.getByTestId("pdf-canvas").boundingBox())!;
    expect(paper.width).toBeLessThanOrEqual(viewport.width); expect(paper.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.getByRole("button", { name: "Apply Changes", exact: true }).filter({ visible: true })).toBeInViewport();
    if (width > 800) expect(await page.getByRole("heading", { name: "Tool properties" }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(14);
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) });
    if (width <= 800) {
      await pagesDrawer(page); const panel = (await page.getByRole("complementary", { name: "PDF pages" }).boundingBox())!;
      const v = (await page.getByTestId("pdf-viewport").boundingBox())!; expect(panel.y).toBeGreaterThanOrEqual(v.y + v.height - 1);
      await page.getByRole("button", { name: "Close pages" }).click();
    }
  }
  if (isMobile) {
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.getByText("Rendering page…", { exact: true })).toHaveCount(0);
    const viewport = (await page.getByTestId("pdf-viewport").boundingBox())!, cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: viewport.x + 180, y: viewport.y + 120 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: viewport.x + 90, y: viewport.y + 120 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.getByTestId("pdf-viewport").evaluate(el => el.scrollLeft)).toBeGreaterThan(40);
    await cdp.detach();
  }
});

test("move, resize, layering, clipboard, drawing eraser and page drag undo correctly", async ({ page, isMobile }) => {
  await openEditor(page);
  await tool(page, "Shape"); await draw(page);
  const shape = page.locator('[data-object-type="shape"]'); const before = await shape.getAttribute("transform");
  const box = (await shape.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 12, { steps: 4 }); await page.mouse.up();
  expect(await shape.getAttribute("transform")).not.toBe(before);
  await page.keyboard.press("Control+z"); expect(await shape.getAttribute("transform")).toBe(before);
  const handle = shape.locator('[data-resize="true"]'), h = (await handle.boundingBox())!;
  const oldWidth = await shape.locator("rect").first().getAttribute("width");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + h.width / 2 + 18, h.y + h.height / 2 + 14, { steps: 4 }); await page.mouse.up();
  expect(await shape.locator("rect").first().getAttribute("width")).not.toBe(oldWidth);
  await page.keyboard.press("Control+c"); await page.keyboard.press("Control+v"); await expect(shape).toHaveCount(2);
  await page.keyboard.press("Control+d"); await expect(shape).toHaveCount(3);
  await page.keyboard.press("Delete"); await expect(shape).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await tool(page, "Draw"); await draw(page, .1, .7, .2, .1);
  if (isMobile) await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("button", { name: "Eraser (whole stroke)" }).click(); await hideProperties(page);
  await page.locator('[data-object-type="drawing"]').click(); await expect(page.locator('[data-object-type="drawing"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.locator('[data-object-type="drawing"]')).toHaveCount(1);
  if (!isMobile) {
    await page.getByTestId("page-card").nth(1).dragTo(page.getByTestId("page-card").nth(0));
    await expect(page.getByText("Page 2 / 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByText("Page 1 / 2", { exact: true })).toBeVisible();
  }
});
