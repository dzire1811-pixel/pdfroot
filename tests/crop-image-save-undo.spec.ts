import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function image(name: string, color: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 640, height: 480, channels: 4, background: color },
    }).png().toBuffer(),
  };
}

async function openCropTool(page: Page, options: { directoryPickerSupported?: boolean } = {}) {
  const { directoryPickerSupported = true } = options;
  await page.addInitScript(({ directoryPickerSupported }) => {
    window.localStorage.setItem("pdfroot_analytics_consent", "rejected");
    const pickerCalls = {
      save: [] as Array<{
        suggestedName: string;
        description?: string;
        accept?: Record<string, string[]>;
        cancelled?: boolean;
        writtenType?: string;
        writtenSize?: number;
      }>,
      directory: 0,
      directoryFiles: [] as string[],
      directoryWrites: [] as Array<{ fileName: string; mimeType: string; size: number }>,
      downloads: [] as Array<{ fileName: string; mimeType: string; size: number }>,
    };
    Object.defineProperty(window, "__cropPickerCalls", { configurable: true, value: pickerCalls });
    const blobMetadata = new Map<string, { mimeType: string; size: number }>();
    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = createObjectUrl(blob);
      if (blob instanceof Blob) blobMetadata.set(url, { mimeType: blob.type, size: blob.size });
      return url;
    };
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      const metadata = blobMetadata.get(this.href);
      if (this.download && metadata) {
        pickerCalls.downloads.push({ fileName: this.download, ...metadata });
        return;
      }
      anchorClick.call(this);
    };
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: {
        suggestedName: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => {
        const call: {
          suggestedName: string;
          description?: string;
          accept?: Record<string, string[]>;
          cancelled?: boolean;
          writtenType?: string;
          writtenSize?: number;
        } = {
          suggestedName: options.suggestedName,
          description: options.types?.[0]?.description,
          accept: options.types?.[0]?.accept,
        };
        pickerCalls.save.push(call);
        const testWindow = window as typeof window & { __cropCancelSavePicker?: boolean };
        if (testWindow.__cropCancelSavePicker) {
          testWindow.__cropCancelSavePicker = false;
          call.cancelled = true;
          throw new DOMException("Save As cancelled", "AbortError");
        }
        return {
          createWritable: async () => ({
            write: async (blob: Blob) => {
              call.writtenType = blob.type;
              call.writtenSize = blob.size;
            },
            close: async () => undefined,
            abort: async () => undefined,
          }),
        };
      },
    });
    if (directoryPickerSupported) {
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: async () => {
          pickerCalls.directory += 1;
          const testWindow = window as typeof window & {
            __cropCancelDirectoryPicker?: boolean;
            __cropDirectoryName?: string;
          };
          if (testWindow.__cropCancelDirectoryPicker) {
            testWindow.__cropCancelDirectoryPicker = false;
            throw new DOMException("Folder selection cancelled", "AbortError");
          }
          return {
            name: testWindow.__cropDirectoryName ?? "Customer Images",
            getFileHandle: async (name: string, pickerOptions?: { create?: boolean }) => {
              if (!pickerOptions?.create) {
                throw new DOMException("File does not exist", "NotFoundError");
              }
              pickerCalls.directoryFiles.push(name);
              return {
                createWritable: async () => ({
                  write: async (blob: Blob) => {
                    pickerCalls.directoryWrites.push({
                      fileName: name,
                      mimeType: blob.type,
                      size: blob.size,
                    });
                  },
                  close: async () => undefined,
                  abort: async () => undefined,
                }),
              };
            },
          };
        },
      });
    } else {
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: undefined,
      });
    }
  }, { directoryPickerSupported });
  await page.goto("/crop-image", { waitUntil: "networkidle" });
}

async function drawCropSelection(page: Page) {
  await page.getByRole("button", { name: "Crop area" }).first().click();
  const frame = await page.locator('[data-crop-image-frame="true"]').boundingBox();
  if (!frame) throw new Error("Crop frame was not measurable");
  await page.mouse.move(frame.x + frame.width * 0.2, frame.y + frame.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.8, frame.y + frame.height * 0.8, { steps: 6 });
  await page.mouse.up();
}

async function completeCurrentImage(page: Page) {
  await drawCropSelection(page);
  await page.getByRole("button", { name: "Crop Image Now" }).click();
}

async function pickerCalls(page: Page) {
  return page.evaluate(() => (
    window as typeof window & {
      __cropPickerCalls: {
        save: Array<{
          suggestedName: string;
          description?: string;
          accept?: Record<string, string[]>;
          cancelled?: boolean;
          writtenType?: string;
          writtenSize?: number;
        }>;
        directory: number;
        directoryFiles: string[];
        directoryWrites: Array<{ fileName: string; mimeType: string; size: number }>;
        downloads: Array<{ fileName: string; mimeType: string; size: number }>;
      };
    }
  ).__cropPickerCalls);
}

test.describe("Crop Image isolated Save and crop history", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop controls cover picker and keyboard routing.");

  test("one new crop uses Save As once and Undo/Redo preserves its saved revision", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("save-once.png", "#ef4444"),
      await image("pending.png", "#22c55e"),
    ]);

    await completeCurrentImage(page);
    const saveButton = page.locator('[data-crop-image-panel-save-device="true"]');
    await expect(saveButton).toContainText("Save 1 Image");
    await saveButton.click();

    const singleModal = page.locator('[data-crop-image-export-modal="true"]');
    await expect(singleModal.getByRole("heading", { name: "Save 1 new crop separately" })).toBeVisible();
    await expect(singleModal.getByRole("textbox", { name: "Base filename" })).toBeVisible();
    await expect(singleModal.getByRole("combobox", { name: "Output format" })).toBeVisible();
    await expect(singleModal.getByText("Save location (optional)", { exact: true })).toBeVisible();
    await expect(singleModal.getByText("Default Downloads", { exact: true })).toBeVisible();
    await expect(singleModal.getByRole("button", { name: "Save as..." })).toBeVisible();
    await expect(singleModal.getByRole("button", { name: "Download 1 file" })).toBeVisible();
    await expect(singleModal.getByText("Filename preview", { exact: true })).toHaveCount(0);
    await singleModal.getByRole("button", { name: "Save as..." }).click();
    await expect(singleModal).toHaveCount(0);

    expect(await pickerCalls(page)).toMatchObject({
      save: [{
        suggestedName: "save-once-crop-01.png",
        description: "PNG Image",
        accept: { "image/png": [".png"] },
        writtenType: "image/png",
      }],
      directory: 0,
      downloads: [],
    });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText("No new completed crops to save.")).toBeVisible();
    expect((await pickerCalls(page)).save).toHaveLength(1);
    await expect(page.locator('[data-crop-image-export-modal="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: /Edit output filename for pending/ }).click();
    const filenameInput = page.getByRole("textbox", { name: /Output filename for pending/ });
    await filenameInput.press("Control+z");
    await expect(page.getByText("1 image ready", { exact: true })).toBeVisible();
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
    await filenameInput.press("Escape");

    await page.getByRole("button", { name: "Crop area" }).first().focus();
    await page.keyboard.press("Control+z");
    await expect(page.getByText("0 images ready", { exact: true })).toBeVisible();
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(2);

    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByText("1 image ready", { exact: true })).toBeVisible();
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
    await expect(page.locator('[data-crop-image-panel-save-device="true"]')).toBeEnabled();
    expect((await pickerCalls(page)).save).toHaveLength(1);

    await completeCurrentImage(page);
    await page.getByRole("button", { name: "Save 1 Image" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await expect(modal.getByRole("heading", { name: "Save 1 new crop separately" })).toBeVisible();
    await modal.getByRole("button", { name: "Download 1 file" }).click();
    await expect(modal).toHaveCount(0);
    expect((await pickerCalls(page)).downloads).toEqual([
      expect.objectContaining({ fileName: "pending-crop-01.png", mimeType: "image/png" }),
    ]);
  });

  test("cancelling single-crop Save As keeps it eligible and JPG options match the encoded file", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("single-save-as.png", "#0f766e"),
    ]);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save As" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("textbox", { name: "Base filename" }).fill("portrait.png");
    await modal.getByRole("combobox", { name: "Output format" }).selectOption("jpg");
    await page.evaluate(() => {
      (window as typeof window & { __cropCancelSavePicker?: boolean }).__cropCancelSavePicker = true;
    });
    await modal.getByRole("button", { name: "Save as..." }).click();

    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Download 1 file" })).toBeEnabled();
    expect((await pickerCalls(page)).save).toEqual([
      expect.objectContaining({
        suggestedName: "portrait-01.jpg",
        description: "JPEG Image",
        accept: { "image/jpeg": [".jpg", ".jpeg"] },
        cancelled: true,
      }),
    ]);
    expect((await pickerCalls(page)).downloads).toEqual([]);

    await modal.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Save As" }).click();
    await expect(modal).toBeVisible();
    await modal.getByRole("textbox", { name: "Base filename" }).fill("portrait.png");
    await modal.getByRole("combobox", { name: "Output format" }).selectOption("jpg");
    await modal.getByRole("button", { name: "Save as..." }).click();
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.save).toHaveLength(2);
    expect(calls.save[1]).toMatchObject({
      suggestedName: "portrait-01.jpg",
      description: "JPEG Image",
      accept: { "image/jpeg": [".jpg", ".jpeg"] },
      writtenType: "image/jpeg",
    });
    expect(calls.save[1].writtenSize).toBeGreaterThan(0);
    expect(calls.directory).toBe(0);
    expect(calls.downloads).toEqual([]);
  });

  test("multiple new crops use direct ordered downloads, sanitize names, and skip pending crops", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("separate-one.png", "#ef4444"),
      await image("separate-two.png", "#22c55e"),
      await image("pending-three.png", "#3b82f6"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.locator('[data-crop-image-panel-save-device="true"]').click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Save separately" }).click();
    await expect(modal.getByRole("heading", { name: "Save 2 new crops separately" })).toBeVisible();
    const baseName = modal.getByRole("textbox", { name: "Base filename" });
    await expect(baseName).toBeVisible();
    await expect(modal.getByRole("combobox", { name: "Output format" })).toBeVisible();
    await expect(modal.getByText("Save location (optional)", { exact: true })).toBeVisible();
    await expect(modal.getByText("Default Downloads", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Choose output folder" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Download 2 files" })).toBeVisible();
    await expect(modal.getByText("Filename preview", { exact: true })).toHaveCount(0);
    await expect(modal.locator('[data-crop-image-filename-preview="true"]')).toHaveCount(0);
    await baseName.fill("document-crop");
    await baseName.fill("document-crop.png");
    await modal.getByRole("button", { name: "Download 2 files" }).click();

    await expect(modal).toHaveCount(0);
    expect(await pickerCalls(page)).toMatchObject({
      save: [],
      directory: 0,
      downloads: [
        { fileName: "document-crop-01.png", mimeType: "image/png" },
        { fileName: "document-crop-02.png", mimeType: "image/png" },
      ],
    });
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
  });

  test("a chosen folder receives ordered JPG files without triggering browser downloads", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("folder-one.png", "#dc2626"),
      await image("folder-two.png", "#16a34a"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Save separately" }).click();
    await modal.getByRole("textbox", { name: "Base filename" }).fill("folder-export");
    await modal.getByRole("combobox", { name: "Output format" }).selectOption("jpg");
    await modal.getByRole("button", { name: "Choose output folder" }).click();

    await expect(modal.getByText("Selected folder: Customer Images", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Change folder" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Use Downloads instead" })).toBeVisible();
    await modal.getByRole("button", { name: "Save 2 files" }).click();
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.directory).toBe(1);
    expect(calls.directoryFiles).toEqual(["folder-export-01.jpg", "folder-export-02.jpg"]);
    expect(calls.directoryWrites).toEqual([
      expect.objectContaining({ fileName: "folder-export-01.jpg", mimeType: "image/jpeg" }),
      expect.objectContaining({ fileName: "folder-export-02.jpg", mimeType: "image/jpeg" }),
    ]);
    expect(calls.directoryWrites.every((write) => write.size > 0)).toBe(true);
    expect(calls.downloads).toEqual([]);
    expect(calls.save).toEqual([]);
  });

  test("folder cancellation preserves the current destination and Downloads can be restored", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("cancel-one.png", "#f97316"),
      await image("cancel-two.png", "#0ea5e9"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Save separately" }).click();
    await page.evaluate(() => {
      (window as typeof window & { __cropCancelDirectoryPicker?: boolean }).__cropCancelDirectoryPicker = true;
    });
    await modal.getByRole("button", { name: "Choose output folder" }).click();
    await expect(modal.getByText("Default Downloads", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Download 2 files" })).toBeVisible();

    await modal.getByRole("button", { name: "Choose output folder" }).click();
    await expect(modal.getByText("Selected folder: Customer Images", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      (window as typeof window & { __cropCancelDirectoryPicker?: boolean }).__cropCancelDirectoryPicker = true;
    });
    await modal.getByRole("button", { name: "Change folder" }).click();
    await expect(modal.getByText("Selected folder: Customer Images", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Save 2 files" })).toBeVisible();

    await modal.getByRole("button", { name: "Use Downloads instead" }).click();
    await expect(modal.getByText("Default Downloads", { exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "Download 2 files" }).click();
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.directory).toBe(3);
    expect(calls.directoryFiles).toEqual([]);
    expect(calls.downloads).toHaveLength(2);
  });

  test("unsupported browsers explain the limitation and retain direct downloads", async ({ page }) => {
    await openCropTool(page, { directoryPickerSupported: false });
    await page.locator("#crop-image-upload").setInputFiles([
      await image("unsupported-one.png", "#a855f7"),
      await image("unsupported-two.png", "#14b8a6"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Save separately" }).click();
    await expect(modal.getByText(
      "Folder selection is not supported in this browser. Files will use the browser's normal download location.",
      { exact: true },
    )).toBeVisible();
    await expect(modal.getByRole("button", { name: "Choose output folder" })).toHaveCount(0);
    await modal.getByRole("button", { name: "Download 2 files" }).click();
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.directory).toBe(0);
    expect(calls.downloads).toHaveLength(2);
  });

  test("JPG encoding matches its extension and rapid clicks do not duplicate downloads", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("jpg-one.png", "#7c3aed"),
      await image("jpg-two.png", "#0891b2"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Save separately" }).click();
    await modal.getByRole("textbox", { name: "Base filename" }).fill("document.jpg");
    await modal.getByRole("combobox", { name: "Output format" }).selectOption("jpg");

    const downloadButton = modal.getByRole("button", { name: "Download 2 files" });
    await downloadButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.directory).toBe(0);
    expect(calls.save).toHaveLength(0);
    expect(calls.downloads).toHaveLength(2);
    expect(calls.downloads).toEqual([
      expect.objectContaining({ fileName: "document-01.jpg", mimeType: "image/jpeg" }),
      expect.objectContaining({ fileName: "document-02.jpg", mimeType: "image/jpeg" }),
    ]);
  });

  test("an encoding failure leaves only the failed crop ready for retry", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("retry-one.png", "#dc2626"),
      await image("retry-two.png", "#16a34a"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Save separately" }).click();
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      let encodingCount = 0;
      Object.defineProperty(window, "__restoreCropToBlob", {
        configurable: true,
        value: () => {
          HTMLCanvasElement.prototype.toBlob = original;
        },
      });
      HTMLCanvasElement.prototype.toBlob = function toBlob(
        callback: BlobCallback,
        type?: string,
        quality?: number,
      ) {
        encodingCount += 1;
        if (encodingCount === 2) {
          callback(null);
          return;
        }
        original.call(this, callback, type, quality);
      };
    });

    await modal.getByRole("button", { name: "Download 2 files" }).click();
    await expect(modal.getByRole("status")).toHaveText(
      "1 crop downloaded successfully. 1 crop remains ready to retry.",
    );
    expect((await pickerCalls(page)).downloads).toHaveLength(1);
    await expect(modal.getByRole("button", { name: "Download 1 file" })).toBeEnabled();

    await page.evaluate(() => (
      window as typeof window & { __restoreCropToBlob: () => void }
    ).__restoreCropToBlob());
    await modal.getByRole("button", { name: "Download 1 file" }).click();
    await expect(modal).toHaveCount(0);
    expect((await pickerCalls(page)).downloads).toHaveLength(2);
  });

  test("combining multiple new crops uses Save As for one PDF", async ({ page }) => {
    await openCropTool(page);
    await page.locator("#crop-image-upload").setInputFiles([
      await image("pdf-one.png", "#3b82f6"),
      await image("pdf-two.png", "#f59e0b"),
    ]);
    await completeCurrentImage(page);
    await completeCurrentImage(page);

    await page.getByRole("button", { name: "Save 2 Images" }).click();
    const modal = page.locator('[data-crop-image-export-modal="true"]');
    await modal.getByRole("button", { name: "Combine into PDF" }).click();
    await expect(modal).toHaveCount(0);

    const calls = await pickerCalls(page);
    expect(calls.directory).toBe(0);
    expect(calls.save).toHaveLength(1);
    expect(calls.save[0]).toMatchObject({
      suggestedName: "PDFRoot-cropped-images.pdf",
      writtenType: "application/pdf",
    });
    expect(calls.save[0].writtenSize).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Undo last crop" }).click();
    await expect(page.getByText("1 image ready", { exact: true })).toBeVisible();
    await expect(page.locator('[data-crop-image-upload-card="true"]')).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByRole("heading", { name: "Your image is ready!" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Saved" })).toBeEnabled();
  });
});

test("file and directory picker support remains local to Crop Image rather than a shared export utility", () => {
  const roots = ["components", "lib"];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(entryPath);
    }
  };
  roots.forEach((root) => visit(path.join(process.cwd(), root)));

  const pickerOwners = files
    .filter((file) => fs.readFileSync(file, "utf8").includes("showSaveFilePicker"))
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"));
  const directoryPickerOwners = files
    .filter((file) => fs.readFileSync(file, "utf8").includes("showDirectoryPicker"))
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"));

  expect(pickerOwners).toEqual(["components/CropImageTool.tsx"]);
  expect(directoryPickerOwners).toEqual(["components/CropImageTool.tsx"]);
});

test("Crop Image removes its keyboard history listener when the tool unmounts", async ({ page }) => {
  await page.addInitScript(() => {
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    const audit = { active: 0 };
    Object.defineProperty(window, "__cropHistoryListenerAudit", { configurable: true, value: audit });

    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === "keydown") audit.active += 1;
      originalAdd(type as keyof WindowEventMap, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      if (type === "keydown") audit.active -= 1;
      originalRemove(type as keyof WindowEventMap, listener, options);
    }) as typeof window.removeEventListener;
  });
  await page.addInitScript(() => window.localStorage.setItem("pdfroot_analytics_consent", "rejected"));
  await page.goto("/crop-image", { waitUntil: "networkidle" });

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __cropHistoryListenerAudit: { active: number } }
  ).__cropHistoryListenerAudit.active)).toBeGreaterThan(0);
  const cropRouteListenerCount = await page.evaluate(() => (
    window as typeof window & { __cropHistoryListenerAudit: { active: number } }
  ).__cropHistoryListenerAudit.active);

  await page.locator('header a[href="/"]').first().click();
  await page.waitForURL(/\/$/);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __cropHistoryListenerAudit: { active: number } }
  ).__cropHistoryListenerAudit.active)).toBeLessThan(cropRouteListenerCount);
});
