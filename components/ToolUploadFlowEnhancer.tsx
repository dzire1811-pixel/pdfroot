"use client";

import { useEffect } from "react";

type WorkflowFile = {
  name: string;
  size: number;
  type: string;
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
  if (section.dataset.v0WorkflowSetup === "true") return;

  const input = section.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) return;

  const owningToolSection = findToolSection(input);
  if (owningToolSection !== section) return;
  const ownedFileInputCount = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((fileInput) => findToolSection(fileInput) === section).length;
  if (ownedFileInputCount > 1) return;

  const uploadScreen = findUploadScreen(section, input);
  const settingsScreen = uploadScreen?.parentElement
    ? Array.from(uploadScreen.parentElement.children).find((child) => child !== uploadScreen && child instanceof HTMLElement)
    : null;

  section.dataset.v0WorkflowSetup = "true";
  section.classList.add("v0-upload-workflow");
  uploadScreen?.setAttribute("data-v0-upload-screen", "true");
  uploadScreen?.parentElement?.setAttribute("data-v0-flow-shell", "true");
  normalizeUploadButton(uploadScreen);

  if (settingsScreen instanceof HTMLElement) {
    settingsScreen.setAttribute("data-v0-settings-screen", "true");
  }

  ensureWorkflowPanel(section);
}

function ensureWorkflowPanel(section: HTMLElement) {
  let panel = section.querySelector<HTMLElement>(":scope > .v0-workflow-panel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.className = "v0-workflow-panel";
  panel.innerHTML = `
    <div class="v0-workflow-kicker">Step <span data-v0-step-number>2</span> of 3</div>
    <div class="v0-workflow-row">
      <div class="v0-workflow-copy">
        <p class="v0-workflow-title" data-v0-workflow-title>File ready</p>
        <p class="v0-workflow-meta"><span data-v0-file-name>Uploaded file</span><span data-v0-file-size></span><span data-v0-file-type></span></p>
      </div>
      <button type="button" class="v0-workflow-change" data-v0-change-file>Change file</button>
      <button type="button" class="v0-workflow-change" data-v0-process-another>Process another file</button>
    </div>
  `;
  section.prepend(panel);

  panel.querySelector<HTMLButtonElement>("[data-v0-change-file]")?.addEventListener("click", () => {
    section.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  });

  panel.querySelector<HTMLButtonElement>("[data-v0-process-another]")?.addEventListener("click", () => {
    resetWorkflow(section, true);
  });

  return panel;
}

function updateWorkflowPanel(section: HTMLElement, file?: WorkflowFile) {
  const panel = ensureWorkflowPanel(section);
  const isResult = section.classList.contains("v0-upload-result");
  const name = file?.name ?? section.dataset.v0FileName ?? "Uploaded file";
  const size = file?.size ? formatFileSize(file.size) : section.dataset.v0FileSize ?? "";
  const type = file?.type || section.dataset.v0FileType || "";

  section.dataset.v0FileName = name;
  section.dataset.v0FileSize = size;
  section.dataset.v0FileType = type;

  const title = panel.querySelector<HTMLElement>("[data-v0-workflow-title]");
  const step = panel.querySelector<HTMLElement>("[data-v0-step-number]");
  const fileName = panel.querySelector<HTMLElement>("[data-v0-file-name]");
  const fileSize = panel.querySelector<HTMLElement>("[data-v0-file-size]");
  const fileType = panel.querySelector<HTMLElement>("[data-v0-file-type]");

  if (title) title.textContent = isResult ? "Your file is ready to download" : "File ready";
  if (step) step.textContent = isResult ? "3" : "2";
  if (fileName) fileName.textContent = name;
  if (fileSize) fileSize.textContent = size ? ` - ${size}` : "";
  if (fileType) fileType.textContent = type ? ` - ${type}` : "";
}

function markReady(section: HTMLElement | null, file?: WorkflowFile) {
  if (!section) return;
  setupWorkflowSection(section);
  section.classList.add("v0-upload-ready");
  section.classList.remove("v0-upload-result");
  section.setAttribute("data-upload-status", "File uploaded successfully");
  section.setAttribute("data-process-status", "Ready to process");
  updateWorkflowPanel(section, file);
}

function markResult(section: HTMLElement | null) {
  if (!section || !section.classList.contains("v0-upload-ready")) return;
  section.classList.add("v0-upload-result");
  section.setAttribute("data-upload-status", "Processing complete");
  section.setAttribute("data-process-status", "Download your result or process another file");
  updateWorkflowPanel(section);
}

function resetWorkflow(section: HTMLElement | null, clickExistingReset = false) {
  if (!section) return;

  if (clickExistingReset) {
    const resetButton = Array.from(section.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      const label = button.textContent?.toLowerCase() ?? "";
      return !button.hasAttribute("data-v0-process-another") && /(remove|clear|change|reset|start over)/.test(label);
    });

    resetButton?.click();
  }
  section.classList.remove("v0-upload-ready", "v0-upload-result");
  section.removeAttribute("data-upload-status");
  section.removeAttribute("data-process-status");
  delete section.dataset.v0FileName;
  delete section.dataset.v0FileSize;
  delete section.dataset.v0FileType;
}

function getFirstFile(files: FileList | null | undefined): WorkflowFile | undefined {
  const file = files?.[0];
  return file ? { name: file.name, size: file.size, type: file.type || file.name.split(".").pop()?.toUpperCase() || "File" } : undefined;
}

function scheduleResultCheck(section: HTMLElement | null) {
  if (!section) return;

  const checkDelays = [500, 1200, 2500, 5000, 9000, 15000];
  checkDelays.forEach((delay) => {
    window.setTimeout(() => {
      if (!section.isConnected || !section.classList.contains("v0-upload-ready")) return;
      const hasDownload = Boolean(section.querySelector('a[download][href^="blob:"], a[download][href^="data:"], a[download]:not([href=""])'));
      if (hasDownload) {
        markResult(section);
      }
    }, delay);
  });
}

function looksLikeProcessButton(label: string) {
  return /(process|convert|compress|resize|merge|split|rotate|protect|unlock|watermark|delete|organize|crop|create|download zip|save)/.test(label);
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
      if (/(remove|clear|change|reset|start over)/.test(label)) {
        resetWorkflow(findToolSection(button));
        return;
      }

      if (looksLikeProcessButton(label)) {
        scheduleResultCheck(findToolSection(button));
      }
    }

    setupAllSections();

    document.addEventListener("change", onChange, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
