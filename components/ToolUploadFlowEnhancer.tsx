"use client";

import { useEffect } from "react";

const HOMEPAGE_UPLOAD_KEY = "pdfroot-homepage-upload";
const HOMEPAGE_UPLOAD_STORE = "homepage-uploads";

type WorkflowFile = {
  name: string;
  size: number;
  type: string;
  file?: File;
};

const PDF_WORKFLOW_TOOL_IDS = new Set([
  "jpg-to-pdf-tool",
  "pdf-to-jpg-tool",
  "compress-pdf-tool",
  "split-pdf-tool",
  "pdf-to-word-tool",
  "word-to-pdf-tool",
  "excel-to-pdf-tool",
  "pdf-to-excel-tool",
  "powerpoint-to-pdf-tool",
  "pdf-to-powerpoint-tool",
  "protect-pdf-tool",
  "unlock-pdf-tool",
  "crop-pdf-tool",
  "rotate-pdf-tool",
  "watermark-pdf-tool",
  "delete-pdf-pages-tool",
  "organize-pdf-pages-tool",
]);

const PDF_ACTION_LABELS: Record<string, string> = {
  "jpg-to-pdf-tool": "Convert to PDF",
  "pdf-to-jpg-tool": "Convert to JPG",
  "compress-pdf-tool": "Compress PDF",
  "split-pdf-tool": "Split PDF",
  "pdf-to-word-tool": "Convert to Word",
  "word-to-pdf-tool": "Convert to PDF",
  "excel-to-pdf-tool": "Convert to PDF",
  "pdf-to-excel-tool": "Convert to Excel",
  "powerpoint-to-pdf-tool": "Convert to PDF",
  "pdf-to-powerpoint-tool": "Convert to PowerPoint",
  "protect-pdf-tool": "Protect PDF",
  "unlock-pdf-tool": "Unlock PDF",
  "crop-pdf-tool": "Crop PDF",
  "rotate-pdf-tool": "Rotate PDF",
  "watermark-pdf-tool": "Watermark PDF",
  "delete-pdf-pages-tool": "Delete Pages",
  "organize-pdf-pages-tool": "Organize PDF",
};

const PDF_PROCESS_MATCHERS: Record<string, RegExp> = {
  "jpg-to-pdf-tool": /create pdf|convert.*pdf|processing/i,
  "pdf-to-jpg-tool": /convert.*jpg|download zip|processing/i,
  "compress-pdf-tool": /compress pdf|compressing/i,
  "split-pdf-tool": /split pdf|splitting/i,
  "pdf-to-word-tool": /convert.*word|converting/i,
  "word-to-pdf-tool": /convert.*pdf|converting/i,
  "excel-to-pdf-tool": /convert.*pdf|converting/i,
  "pdf-to-excel-tool": /convert.*excel|converting/i,
  "powerpoint-to-pdf-tool": /convert.*pdf|converting/i,
  "pdf-to-powerpoint-tool": /convert.*pptx|convert.*powerpoint|converting/i,
  "protect-pdf-tool": /protect pdf|processing/i,
  "unlock-pdf-tool": /unlock pdf|processing/i,
  "crop-pdf-tool": /crop pdf|processing/i,
  "rotate-pdf-tool": /download rotated pdf|processing/i,
  "watermark-pdf-tool": /add watermark|processing/i,
  "delete-pdf-pages-tool": /delete selected pages|processing/i,
  "organize-pdf-pages-tool": /download organized pdf|processing/i,
};

function findToolSection(target: EventTarget | null) {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('section[id$="-tool"]') : null;
}

function isPdfWorkflowSection(section: HTMLElement | null) {
  return Boolean(section?.id && PDF_WORKFLOW_TOOL_IDS.has(section.id));
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Ready";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function closestWorkflowChild(section: HTMLElement, element: HTMLElement) {
  let current: HTMLElement | null = element;
  let previous: HTMLElement | null = null;

  while (current && current !== section) {
    previous = current;
    current = current.parentElement;
  }

  return previous;
}

function findUploadScreen(section: HTMLElement, input: HTMLInputElement) {
  const labelledUpload = input.closest<HTMLElement>("label");
  if (labelledUpload?.parentElement && labelledUpload.parentElement !== section) {
    return labelledUpload.parentElement;
  }

  return closestWorkflowChild(section, input);
}

function normalizeUploadButton(uploadScreen: HTMLElement | null) {
  const label = uploadScreen?.querySelector<HTMLElement>('label[class*="border-dashed"]');
  if (!label) return;

  const buttonLike = Array.from(label.children).find((child) => {
    if (!(child instanceof HTMLElement)) return false;
    const text = child.textContent?.toLowerCase() ?? "";
    return /choose|select|upload/.test(text) && (child.tagName === "BUTTON" || child.className.includes("px-"));
  });

  if (!(buttonLike instanceof HTMLElement)) return;

  const textNode = Array.from(buttonLike.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = "Choose Files";
    return;
  }

  buttonLike.prepend(document.createTextNode("Choose Files"));
}

function setupWorkflowSection(section: HTMLElement) {
  if (section.dataset.v0ManagedFlow === "true") return false;
  if (section.dataset.v0WorkflowSetup === "true") return true;

  const input = section.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) return false;

  const owningToolSection = findToolSection(input);
  if (owningToolSection !== section) return false;
  const ownedFileInputCount = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((fileInput) => findToolSection(fileInput) === section).length;
  if (ownedFileInputCount > 1) return false;

  const uploadScreen = findUploadScreen(section, input);
  const settingsScreen = uploadScreen?.parentElement
    ? Array.from(uploadScreen.parentElement.children).find((child) => child !== uploadScreen && child instanceof HTMLElement)
    : null;

  section.dataset.v0WorkflowSetup = "true";
  section.classList.add("v0-upload-workflow");
  uploadScreen?.setAttribute("data-v0-upload-screen", "true");
  uploadScreen?.parentElement?.setAttribute("data-v0-flow-shell", "true");
  if (uploadScreen) {
    closestWorkflowChild(section, uploadScreen)?.setAttribute("data-v0-flow-shell", "true");
  }
  markFlowExtras(section);
  normalizeUploadButton(uploadScreen);

  if (settingsScreen instanceof HTMLElement) {
    settingsScreen.setAttribute("data-v0-settings-screen", "true");
  }

  ensureWorkflowPanel(section);
  if (isPdfWorkflowSection(section)) {
    section.dataset.v0PdfWorkflow = "true";
    normalizePdfActionButtons(section);
  }
  return true;
}

function markFlowExtras(section: HTMLElement) {
  Array.from(section.children).forEach((child) => {
    if (child instanceof HTMLElement && !child.classList.contains("v0-workflow-panel") && !child.hasAttribute("data-v0-flow-shell")) {
      child.setAttribute("data-v0-flow-extra", "true");
    }
  });
}

function ensureWorkflowPanel(section: HTMLElement) {
  let panel = section.querySelector<HTMLElement>(":scope > .v0-workflow-panel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.className = "v0-workflow-panel";
  panel.innerHTML = `
    <div class="v0-workflow-row">
      <button type="button" class="v0-workflow-change" data-v0-change-file>Change file</button>
    </div>
  `;
  section.prepend(panel);

  panel.querySelector<HTMLButtonElement>("[data-v0-change-file]")?.addEventListener("click", () => {
    section.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  });

  return panel;
}

function getPdfActionLabel(section: HTMLElement) {
  return PDF_ACTION_LABELS[section.id] ?? "Process PDF";
}

function replaceFirstTextNode(element: HTMLElement, label: string) {
  const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = label;
    return;
  }
  element.prepend(document.createTextNode(label));
}

function normalizePdfActionButtons(section: HTMLElement) {
  const actionLabel = getPdfActionLabel(section);
  const processMatcher = PDF_PROCESS_MATCHERS[section.id] ?? /(process|convert|compress|merge|split|rotate|protect|unlock|watermark|delete|organize|crop|create|save)/i;
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>("button"));

  buttons.forEach((button) => {
    const label = button.textContent?.toLowerCase().trim() ?? "";
    const hasIcon = Boolean(button.querySelector("svg"));
    if (looksLikeResetButton(label)) {
      button.dataset.v0ResetButton = "true";
      return;
    }

    if (hasIcon && processMatcher.test(label)) {
      button.dataset.v0ProcessButton = "true";
      replaceFirstTextNode(button, actionLabel);
    }
  });
}

function getPrimaryProcessButton(section: HTMLElement) {
  normalizePdfActionButtons(section);
  return Array.from(section.querySelectorAll<HTMLButtonElement>("button[data-v0-process-button='true']")).find((button) => !button.closest(".v0-pdf-action-bar"));
}

function getPrimaryResetButton(section: HTMLElement) {
  normalizePdfActionButtons(section);
  return Array.from(section.querySelectorAll<HTMLButtonElement>("button[data-v0-reset-button='true']")).find((button) => !button.closest(".v0-pdf-action-bar"));
}

function looksLikeResetButton(label: string) {
  return /(remove|clear|change|reset|start over|process another|another file|another pdf|another image)/.test(label);
}

function ensurePdfActionBar(section: HTMLElement) {
  if (!isPdfWorkflowSection(section)) return null;

  let bar = section.querySelector<HTMLElement>(":scope > .v0-pdf-action-bar");
  const actionLabel = getPdfActionLabel(section);
  const fileName = section.dataset.v0FileName ?? "File ready";

  if (!bar) {
    bar = document.createElement("div");
    bar.className = "v0-pdf-action-bar";
    bar.innerHTML = `
      <div>
        <p class="v0-pdf-action-title" data-v0-pdf-action-title></p>
      </div>
      <div class="v0-pdf-action-buttons">
        <button type="button" class="v0-pdf-action-primary" data-v0-pdf-run></button>
        <button type="button" class="v0-pdf-action-reset" data-v0-pdf-reset>Clear</button>
      </div>
    `;
    section.append(bar);

    bar.querySelector<HTMLButtonElement>("[data-v0-pdf-run]")?.addEventListener("click", () => {
      const processButton = getPrimaryProcessButton(section);
      if (!processButton || processButton.disabled) return;
      processButton.click();
      window.setTimeout(() => {
        if (section.querySelector("[data-v0-result-screen='true']")) return;
        const hasError = Boolean(section.querySelector(".text-red-700, .text-destructive"));
        if (!hasError) {
          markProcessing(section);
          scheduleResultCheck(section);
        }
      }, 120);
    });

    bar.querySelector<HTMLButtonElement>("[data-v0-pdf-reset]")?.addEventListener("click", () => {
      const resetButton = getPrimaryResetButton(section);
      if (resetButton && !resetButton.disabled) {
        resetButton.click();
      }
      resetWorkflow(section);
    });
  }

  bar.querySelector<HTMLElement>("[data-v0-pdf-action-title]")?.replaceChildren(document.createTextNode(fileName));
  bar.querySelector<HTMLButtonElement>("[data-v0-pdf-run]")?.replaceChildren(document.createTextNode(actionLabel));
  return bar;
}

function ensureProcessingScreen(section: HTMLElement) {
  let screen = section.querySelector<HTMLElement>(":scope > .v0-pdf-processing-screen");
  if (screen) return screen;

  screen = document.createElement("div");
  screen.className = "v0-pdf-processing-screen";
  screen.innerHTML = `
    <div class="v0-pdf-state-card">
      <div class="v0-pdf-spinner" aria-hidden="true"></div>
      <h3>Processing your file...</h3>
      <p>Please wait while we prepare your download.</p>
      <div class="v0-pdf-progress"><span></span></div>
      <strong>Working</strong>
    </div>
  `;
  section.append(screen);
  return screen;
}

function markProcessing(section: HTMLElement | null) {
  if (!isPdfWorkflowSection(section) || !section) return;
  setupWorkflowSection(section);
  section.classList.add("v0-pdf-processing");
  section.classList.remove("v0-upload-result");
  section.setAttribute("aria-busy", "true");
  getPrimaryProcessButton(section)?.setAttribute("disabled", "true");
  ensureProcessingScreen(section);
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getExistingDownload(section: HTMLElement) {
  const link = Array.from(section.querySelectorAll<HTMLAnchorElement>('a[download]')).find((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    return href.length > 0 && !anchor.closest(".v0-pdf-result-screen");
  });
  if (link) return { type: "link" as const, element: link };

  const button = Array.from(section.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => {
    const label = candidate.textContent?.toLowerCase() ?? "";
    return /download/.test(label) && !candidate.closest(".v0-pdf-result-screen");
  });
  if (button) return { type: "button" as const, element: button };

  return null;
}

function ensureResultScreen(section: HTMLElement) {
  let screen = section.querySelector<HTMLElement>(":scope > .v0-pdf-result-screen");
  const download = getExistingDownload(section);
  const labelText = download?.element.textContent?.trim() || "Download";

  if (!screen) {
    screen = document.createElement("div");
    screen.className = "v0-pdf-result-screen";
    screen.setAttribute("data-v0-result-screen", "true");
    screen.innerHTML = `
      <div class="v0-pdf-state-card">
        <div class="v0-pdf-success-icon" aria-hidden="true">✓</div>
        <h3>Your file is ready!</h3>
        <p>Download the processed file or start again with another file.</p>
        <div data-v0-result-download-slot></div>
        <button type="button" class="v0-pdf-result-reset" data-v0-process-another>Process another file</button>
      </div>
    `;
    section.append(screen);

    screen.querySelector<HTMLButtonElement>("[data-v0-process-another]")?.addEventListener("click", () => {
      const resetButton = getPrimaryResetButton(section);
      if (resetButton && !resetButton.disabled) {
        resetButton.click();
      }
      resetWorkflow(section);
    });
  }

  const slot = screen.querySelector<HTMLElement>("[data-v0-result-download-slot]");
  if (slot && download) {
    slot.replaceChildren();
    if (download.type === "link") {
      const anchor = document.createElement("a");
      anchor.className = "v0-pdf-result-download";
      anchor.href = download.element.href;
      anchor.download = download.element.download;
      anchor.textContent = labelText;
      slot.append(anchor);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "v0-pdf-result-download";
      button.textContent = labelText;
      button.addEventListener("click", () => download.element.click());
      slot.append(button);
    }
  }

  return screen;
}

function ensureWorkspacePreview(section: HTMLElement) {
  let preview = section.querySelector<HTMLElement>(":scope > .v0-workspace-preview");
  if (preview) return preview;

  preview = document.createElement("div");
  preview.className = "v0-workspace-preview";
  preview.innerHTML = `
    <div class="v0-workspace-stage" data-v0-preview-stage>
      <div class="v0-document-card">
        <div class="v0-document-icon">FILE</div>
        <div>
          <p class="v0-document-name" data-v0-preview-name>Uploaded file</p>
          <p class="v0-document-meta" data-v0-preview-meta>Ready to process</p>
        </div>
      </div>
    </div>
    <div class="v0-workspace-details">
      <div>
        <span>Original file</span>
        <strong data-v0-detail-name>Uploaded file</strong>
      </div>
      <div>
        <span>Size</span>
        <strong data-v0-detail-size>Ready</strong>
      </div>
      <div>
        <span>Dimensions</span>
        <strong data-v0-detail-dimensions>Detecting...</strong>
      </div>
    </div>
  `;
  const panel = section.querySelector(":scope > .v0-workflow-panel");
  panel?.insertAdjacentElement("afterend", preview);
  return preview;
}

function isImageWorkflowFile(file?: WorkflowFile) {
  const type = file?.type.toLowerCase() ?? "";
  const name = file?.name.toLowerCase() ?? "";
  return type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(name);
}

function isPdfWorkflowFile(file?: WorkflowFile) {
  const type = file?.type.toLowerCase() ?? "";
  const name = file?.name.toLowerCase() ?? "";
  return type === "application/pdf" || name.endsWith(".pdf");
}

function revokePreviewUrl(section: HTMLElement) {
  const url = section.dataset.v0PreviewUrl;
  if (url) {
    URL.revokeObjectURL(url);
    delete section.dataset.v0PreviewUrl;
  }
}

function updateWorkspacePreview(section: HTMLElement, file?: WorkflowFile) {
  const preview = ensureWorkspacePreview(section);
  const stage = preview.querySelector<HTMLElement>("[data-v0-preview-stage]");
  const name = file?.name ?? section.dataset.v0FileName ?? "Uploaded file";
  const size = file?.size ? formatFileSize(file.size) : section.dataset.v0FileSize ?? "Ready";
  const icon = isPdfWorkflowFile(file) ? "PDF" : isImageWorkflowFile(file) ? "IMG" : "FILE";

  preview.querySelector<HTMLElement>("[data-v0-preview-name]")?.replaceChildren(document.createTextNode(name));
  preview.querySelector<HTMLElement>("[data-v0-preview-meta]")?.replaceChildren(document.createTextNode(size));
  preview.querySelector<HTMLElement>("[data-v0-detail-name]")?.replaceChildren(document.createTextNode(name));
  preview.querySelector<HTMLElement>("[data-v0-detail-size]")?.replaceChildren(document.createTextNode(size));

  const dimensions = preview.querySelector<HTMLElement>("[data-v0-detail-dimensions]");
  if (dimensions) dimensions.textContent = isImageWorkflowFile(file) ? "Detecting..." : isPdfWorkflowFile(file) ? "PDF document" : "Document";

  if (!stage) return;
  revokePreviewUrl(section);

  if (isImageWorkflowFile(file) && file?.file) {
    const url = URL.createObjectURL(file.file);
    section.dataset.v0PreviewUrl = url;
    stage.innerHTML = `
      <article class="v0-uploaded-file-card">
        <div class="v0-uploaded-file-preview">
          <span class="v0-uploaded-file-index">1</span>
          <img class="v0-preview-image" alt="Uploaded image preview" src="${url}" />
        </div>
        <div class="v0-uploaded-file-info">
          <div>
            <p class="v0-document-name" data-v0-card-name></p>
            <p class="v0-document-meta" data-v0-card-meta></p>
          </div>
        </div>
      </article>
    `;
    stage.querySelector<HTMLElement>("[data-v0-card-name]")?.replaceChildren(document.createTextNode(name));
    stage.querySelector<HTMLElement>("[data-v0-card-meta]")?.replaceChildren(document.createTextNode(size));
    const image = stage.querySelector<HTMLImageElement>("img");
    image?.addEventListener("load", () => {
      if (dimensions) dimensions.textContent = `${image.naturalWidth} x ${image.naturalHeight}px`;
    });
    return;
  }

  stage.innerHTML = `
    <article class="v0-uploaded-file-card">
      <div class="v0-uploaded-file-preview">
        <span class="v0-uploaded-file-index">1</span>
        <div class="v0-document-icon">${icon}</div>
      </div>
      <div class="v0-uploaded-file-info">
        <div>
          <p class="v0-document-name" data-v0-card-name></p>
          <p class="v0-document-meta" data-v0-card-meta></p>
          <p class="v0-document-note" data-v0-card-note></p>
        </div>
      </div>
    </article>
  `;
  stage.querySelector<HTMLElement>("[data-v0-card-name]")?.replaceChildren(document.createTextNode(name));
  stage.querySelector<HTMLElement>("[data-v0-card-meta]")?.replaceChildren(document.createTextNode(size));
  stage.querySelector<HTMLElement>("[data-v0-card-note]")?.replaceChildren(document.createTextNode(isPdfWorkflowFile(file) ? "PDF preview will appear where supported by the tool." : "File is ready for this tool workflow."));
}

function updateWorkflowPanel(section: HTMLElement, file?: WorkflowFile) {
  ensureWorkflowPanel(section);
  const name = file?.name ?? section.dataset.v0FileName ?? "Uploaded file";
  const size = file?.size ? formatFileSize(file.size) : section.dataset.v0FileSize ?? "";
  const type = file?.type || section.dataset.v0FileType || "";

  section.dataset.v0FileName = name;
  section.dataset.v0FileSize = size;
  section.dataset.v0FileType = type;
}

function markReady(section: HTMLElement | null, file?: WorkflowFile) {
  if (!section) return;
  if (section.dataset.v0ManagedFlow === "true") return;
  if (!setupWorkflowSection(section)) return;
  if (isPdfWorkflowSection(section)) normalizePdfActionButtons(section);
  section.classList.add("v0-upload-ready");
  section.classList.remove("v0-upload-result", "v0-pdf-processing");
  section.removeAttribute("aria-busy");
  section.setAttribute("data-upload-status", "File uploaded successfully");
  section.setAttribute("data-process-status", "Ready to process");
  updateWorkflowPanel(section, file);
  updateWorkspacePreview(section, file);
  ensurePdfActionBar(section);
  [0, 100, 500, 1200].forEach((delay) => window.setTimeout(() => markFlowExtras(section), delay));
}

function markResult(section: HTMLElement | null) {
  if (section?.dataset.v0ManagedFlow === "true") return;
  if (!section || !section.classList.contains("v0-upload-ready")) return;
  section.classList.add("v0-upload-result");
  section.classList.remove("v0-pdf-processing");
  section.removeAttribute("aria-busy");
  section.setAttribute("data-upload-status", "Processing complete");
  section.setAttribute("data-process-status", "Download your result or process another file");
  updateWorkflowPanel(section);
  if (isPdfWorkflowSection(section)) ensureResultScreen(section);
}

function resetWorkflow(section: HTMLElement | null, clickExistingReset = false) {
  if (!section) return;
  if (section.dataset.v0ManagedFlow === "true") return;

  if (clickExistingReset) {
    const resetButton = Array.from(section.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      const label = button.textContent?.toLowerCase() ?? "";
      return !button.hasAttribute("data-v0-process-another") && /(remove|clear|change|reset|start over|resize another|another image)/.test(label);
    });

    resetButton?.click();
  }
  section.classList.remove("v0-upload-ready", "v0-upload-result");
  section.classList.remove("v0-pdf-processing");
  section.removeAttribute("aria-busy");
  section.removeAttribute("data-upload-status");
  section.removeAttribute("data-process-status");
  revokePreviewUrl(section);
  section.querySelector<HTMLElement>(":scope > .v0-workspace-preview")?.remove();
  section.querySelector<HTMLElement>(":scope > .v0-pdf-processing-screen")?.remove();
  section.querySelector<HTMLElement>(":scope > .v0-pdf-result-screen")?.remove();
  section.querySelector<HTMLElement>(":scope > .v0-pdf-action-bar")?.remove();
  delete section.dataset.v0FileName;
  delete section.dataset.v0FileSize;
  delete section.dataset.v0FileType;
}

function getFirstFile(files: FileList | null | undefined): WorkflowFile | undefined {
  const file = files?.[0];
  return file ? { name: file.name, size: file.size, type: file.type || file.name.split(".").pop()?.toUpperCase() || "File", file } : undefined;
}

function scheduleResultCheck(section: HTMLElement | null) {
  if (!section) return;

  const checkDelays = [500, 1200, 2500, 5000, 9000, 15000];
  checkDelays.forEach((delay) => {
    window.setTimeout(() => {
      if (!section.isConnected || !section.classList.contains("v0-upload-ready")) return;
      const hasDownloadLink = Boolean(section.querySelector('a[download][href^="blob:"], a[download][href^="data:"], a[download]:not([href=""])'));
      const hasDownloadButton = Array.from(section.querySelectorAll<HTMLButtonElement>("button")).some((button) => {
        const label = button.textContent?.toLowerCase() ?? "";
        const style = window.getComputedStyle(button);
        return /download/.test(label) && style.display !== "none" && style.visibility !== "hidden";
      });
      const hasDownload = hasDownloadLink || hasDownloadButton;
      if (hasDownload) {
        markResult(section);
      }
    }, delay);
  });
}

function looksLikeProcessButton(label: string) {
  return /(process|convert|compress|resize|merge|split|rotate|protect|unlock|watermark|delete|organize|crop|create|download zip|save)/.test(label);
}

function readPendingHomepageUpload() {
  try {
    const raw = window.sessionStorage.getItem(HOMEPAGE_UPLOAD_KEY);
    return raw ? (JSON.parse(raw) as { route?: string; updatedAt?: number }) : null;
  } catch {
    return null;
  }
}

function clearPendingHomepageUpload() {
  window.sessionStorage.removeItem(HOMEPAGE_UPLOAD_KEY);

  const request = window.indexedDB.open(HOMEPAGE_UPLOAD_STORE, 1);
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("files")) {
      db.close();
      return;
    }

    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").delete(HOMEPAGE_UPLOAD_KEY);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  };
}

function getPendingHomepageFile() {
  return new Promise<File | null>((resolve) => {
    const request = window.indexedDB.open(HOMEPAGE_UPLOAD_STORE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("files", "readonly");
      const getRequest = transaction.objectStore("files").get(HOMEPAGE_UPLOAD_KEY);
      getRequest.onsuccess = () => resolve(getRequest.result instanceof File ? getRequest.result : null);
      getRequest.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    };
  });
}

async function applyPendingHomepageUpload() {
  const pending = readPendingHomepageUpload();
  if (!pending?.route || pending.route !== window.location.pathname) return false;
  if (pending.updatedAt && Date.now() - pending.updatedAt > 5 * 60 * 1000) {
    clearPendingHomepageUpload();
    return false;
  }

  const input = document.querySelector<HTMLInputElement>('section[id$="-tool"] input[type="file"]');
  if (!input) return false;

  const file = await getPendingHomepageFile();
  if (!file) {
    clearPendingHomepageUpload();
    return false;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  markReady(findToolSection(input), { name: file.name, size: file.size, type: file.type || file.name.split(".").pop()?.toUpperCase() || "File", file });
  clearPendingHomepageUpload();
  return true;
}

export function ToolUploadFlowEnhancer() {
  useEffect(() => {
    const setupAllSections = () => {
      document.querySelectorAll<HTMLElement>('section[id$="-tool"]').forEach(setupWorkflowSection);
    };

    function onChange(event: Event) {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "file" && input.files && input.files.length > 0) {
        markReady(findToolSection(input), getFirstFile(input.files));
      }
    }

    function onDrop(event: DragEvent) {
      if (event.dataTransfer?.files.length) {
        markReady(findToolSection(event.target), getFirstFile(event.dataTransfer.files));
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest("button");
      const link = target?.closest("a[download]");
      if (link) {
        markResult(findToolSection(link));
        return;
      }

      if (!button) return;

      const label = button.textContent?.toLowerCase() ?? "";
      if (/(remove|clear|change|reset|start over|resize another|another image)/.test(label)) {
        resetWorkflow(findToolSection(button));
        return;
      }

      if (looksLikeProcessButton(label)) {
        const section = findToolSection(button);
        if (isPdfWorkflowSection(section) && !button.dataset.v0ProcessButton && !button.closest(".v0-pdf-action-bar") && !button.closest(".v0-pdf-result-screen")) {
          return;
        }

        if (isPdfWorkflowSection(section) && !button.closest(".v0-pdf-action-bar") && !button.closest(".v0-pdf-result-screen")) {
          window.setTimeout(() => {
            if (button.disabled) return;
            const hasError = Boolean(section?.querySelector(".text-red-700, .text-destructive"));
            if (!hasError) markProcessing(section);
          }, 120);
        }
        scheduleResultCheck(section);
      }
    }

    setupAllSections();
    const homepageUploadTimers = [0, 250, 750, 1500, 3000].map((delay) =>
      window.setTimeout(() => {
        setupAllSections();
        void applyPendingHomepageUpload();
      }, delay),
    );

    document.addEventListener("change", onChange, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("click", onClick, true);
      homepageUploadTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}
