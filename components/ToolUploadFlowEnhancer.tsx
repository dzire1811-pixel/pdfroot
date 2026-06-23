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

function findToolSection(target: EventTarget | null) {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('section[id$="-tool"]') : null;
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
    stage.innerHTML = `<img class="v0-preview-image" alt="Uploaded image preview" src="${url}" />`;
    const image = stage.querySelector<HTMLImageElement>("img");
    image?.addEventListener("load", () => {
      if (dimensions) dimensions.textContent = `${image.naturalWidth} x ${image.naturalHeight}px`;
    });
    return;
  }

  stage.innerHTML = `
    <div class="v0-document-card">
      <div class="v0-document-icon">${isPdfWorkflowFile(file) ? "PDF" : "FILE"}</div>
      <div>
        <p class="v0-document-name" data-v0-card-name></p>
        <p class="v0-document-meta" data-v0-card-meta></p>
        <p class="v0-document-note" data-v0-card-note></p>
      </div>
    </div>
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
  section.classList.add("v0-upload-ready");
  section.classList.remove("v0-upload-result");
  section.setAttribute("data-upload-status", "File uploaded successfully");
  section.setAttribute("data-process-status", "Ready to process");
  updateWorkflowPanel(section, file);
  updateWorkspacePreview(section, file);
  [0, 100, 500, 1200].forEach((delay) => window.setTimeout(() => markFlowExtras(section), delay));
}

function markResult(section: HTMLElement | null) {
  if (section?.dataset.v0ManagedFlow === "true") return;
  if (!section || !section.classList.contains("v0-upload-ready")) return;
  section.classList.add("v0-upload-result");
  section.setAttribute("data-upload-status", "Processing complete");
  section.setAttribute("data-process-status", "Download your result or process another file");
  updateWorkflowPanel(section);
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
  section.removeAttribute("data-upload-status");
  section.removeAttribute("data-process-status");
  revokePreviewUrl(section);
  section.querySelector<HTMLElement>(":scope > .v0-workspace-preview")?.remove();
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
        scheduleResultCheck(findToolSection(button));
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
