const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  session,
  shell,
  Tray,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { getTool, tools } = require("./catalog.cjs");
const { createDeviceIdentity } = require("./device.cjs");
const { LicenseStore } = require("./license.cjs");
const { PaymentClient, paymentApiUrl } = require("./payment-client.cjs");
const { AccountClient } = require("./account-client.cjs");
const { googleClientId, signInWithGoogle } = require("./google-login.cjs");
const { quickShortcuts } = require("./shortcuts.cjs");
const { displayAccelerator, registerShortcutSet } = require("./shortcut-registration.cjs");
const { contextToolAcceptsFiles, contextToolGroup, readContextTool } = require("./context-menu.cjs");
const {
  getFocusedExplorerSelection,
  startExplorerSelectionService,
  stopExplorerSelectionService,
} = require("./windows-explorer.cjs");
const { DesktopSettings, PROCESSING_MODES } = require("./settings.cjs");
const { repairContextMenu, configureAutomaticStartup, resolveLaunchSelection } = require("./startup-setup.cjs");
const { automaticTools, nextAvailableOutputPath, validateAutomaticSelection } = require("./automatic-mode.cjs");
const {
  LocalAutoUnavailableError,
  localAutoSlugs,
  PDF_COMPRESSION_PRESETS,
  processLocalAutoJob,
} = require("./local-auto.cjs");
const { desktopBrandInjectionScript } = require("./branding.cjs");
const { findDesktopToolsPython, renderWithDesktopTools } = require("./native-pdf-renderer.cjs");
const { frontBackPreviews } = require("./front-back-preview.cjs");
const { cropSource, replaceCroppedImage, saveCroppedCopy } = require("./crop-replace.cjs");
const { createPagePreviews, validatePageOrder } = require("./page-order.cjs");
const { IMAGE_PRESETS, parseTargetKb, parsePhotoDate } = require("./recruitment-settings.cjs");

const WEB_APP_ORIGIN = process.env.PDFROOT_APP_URL || "https://www.pdfroot.com";
const AUTO_JOB_TIMEOUT_MS = 3 * 60 * 1000;
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
let mainWindow;
let autoWindow;
let localRendererWindow;
let localRendererReady;
let compressionChoiceWindow;
let imageChoiceWindow;
let frontBackChoiceWindow;
let frontBackChoiceFiles;
let pageOrderSession;
let cropSession;
let tray;
let licenseStore;
let paymentClient;
let accountClient;
let paymentPollTimer;
let licenseSweepTimer;
let updateTimer;
let updateInstallTimer;
let availableUpdate;
let updateCheckPromise;
let lastUpdateCheckAt = 0;
let updatePhase = "idle";
let updateProgress = 0;
let updateError = "";
let updateReady = false;
let installingUpdate = false;
let desktopSettings;
let deviceId;
let appIsQuitting = false;
let activeAutoJob;
let autoJobNumber = 0;
let shortcutRetryTimer;
let shortcutHealthSignature;
let lastShortcutActivity;
const shortcutResults = new Map();
const pendingFilesByWebContents = new Map();
const recentShortcutKeys = new Map();
const queuedAutoShortcuts = [];
let drainingAutoShortcuts = false;
let startupReady = false;
const pendingLaunches = [];

function localUiPath(fileName) {
  return path.join(__dirname, "ui", fileName);
}

function resourcePath(fileName) {
  return app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(__dirname, "..", "resources", fileName);
}

function prepareLocalRenderer() {
  if (localRendererWindow && !localRendererWindow.isDestroyed()) return Promise.resolve(localRendererWindow);
  if (localRendererReady) return localRendererReady;

  const iconPath = resourcePath("icon.png");
  const worker = new BrowserWindow({
    width: 20,
    height: 20,
    show: false,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: "#ffffff",
    title: "PDFRoot Local Auto Engine",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  localRendererWindow = worker;
  worker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  localRendererReady = new Promise((resolve, reject) => {
    let loaded = false;
    worker.webContents.once("did-finish-load", async () => {
      try {
        // did-finish-load can fire before a module script has completed.
        await worker.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const started = Date.now();
          const check = () => {
            if (typeof window.pdfrootLocalRenderer?.renderPdfToJpg === "function") return resolve(true);
            if (Date.now() - started > 8000) return reject(new Error("PDF renderer module did not initialize"));
            setTimeout(check, 50);
          };
          check();
        })`, true);
        loaded = true;
        resolve(worker);
      } catch (error) {
        reject(error);
      }
    });
    worker.webContents.once("did-fail-load", (_event, _code, description) => {
      reject(new Error(description || "The local PDF renderer could not start."));
    });
    worker.on("closed", () => {
      if (!loaded) reject(new Error("The local PDF renderer closed before it was ready."));
      localRendererWindow = undefined;
      localRendererReady = undefined;
    });
    worker.loadFile(localUiPath("auto-renderer.html")).catch(reject);
  }).catch((error) => {
    localRendererReady = undefined;
    if (localRendererWindow && !localRendererWindow.isDestroyed()) localRendererWindow.destroy();
    localRendererWindow = undefined;
    throw error;
  });
  return localRendererReady;
}

async function renderPdfToJpg(filePath, renderOptions = {}) {
  let nativeIssue = "";
  const nativePython = await findDesktopToolsPython();
  if (nativePython) {
    try {
      return await renderWithDesktopTools(nativePython, filePath, renderOptions);
    } catch (error) {
      nativeIssue = String(error?.stderr || error?.message || "Desktop Tools failed").replace(/\s+/g, " ").slice(0, 120);
    }
  }
  let data;
  try {
    data = await fs.promises.readFile(filePath);
  } catch {
    throw new LocalAutoUnavailableError(`PDFRoot could not read ${path.basename(filePath)} for local rendering.`);
  }
  if (data.length > 40 * 1024 * 1024) {
    throw new LocalAutoUnavailableError(`${path.basename(filePath)} is too large for the fast local renderer.`);
  }

  try {
    const worker = await prepareLocalRenderer();
    const payload = JSON.stringify({ base64: data.toString("base64"), ...renderOptions });
    const result = await worker.webContents.executeJavaScript(
      `window.pdfrootLocalRenderer?.renderPdfToJpg(${payload})`,
      true,
    );
    if (!Array.isArray(result) || !result.every((entry) => typeof entry === "string" && entry.length)) {
      throw new Error("The local renderer did not return page images.");
    }
    return result;
  } catch (error) {
    const detail = String(error?.message || "The PDF renderer did not respond").replace(/\s+/g, " ").slice(0, 140);
    throw new LocalAutoUnavailableError(`${path.basename(filePath)} could not render locally: ${nativeIssue ? "Desktop Tools: " + nativeIssue + "; " : ""}${detail}`);
  }
}

function bringToFront() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function currentLicenseStatus() {
  return { ...licenseStore.getStatus(), deviceId };
}

function isActivationPage(event) {
  return event.sender === mainWindow?.webContents && event.sender.getURL() === pathToFileURL(localUiPath("activation.html")).href;
}

function isLocalAppPage(event) {
  return event.sender === mainWindow?.webContents && ["catalog.html", "activation.html"]
    .some((file) => event.sender.getURL() === pathToFileURL(localUiPath(file)).href);
}

function updateState() {
  return { currentVersion: app.getVersion(), available: availableUpdate
    ? { version: availableUpdate.version }
    : null, phase: updatePhase, progress: updateProgress, error: updateError };
}

function notifyLocalUpdate() {
  if (mainWindow && !mainWindow.isDestroyed() &&
      ["catalog.html", "activation.html"].some((file) =>
        mainWindow.webContents.getURL() === pathToFileURL(localUiPath(file)).href)) {
    mainWindow.webContents.send("desktop:update-status", updateState());
  }
}

async function checkForDesktopUpdate(force = false) {
  if (updateCheckPromise) return updateCheckPromise;
  if (!app.isPackaged) return updateState();
  if (["downloading", "ready", "waiting", "installing"].includes(updatePhase)) return updateState();
  if (!force && Date.now() - lastUpdateCheckAt < UPDATE_INTERVAL_MS) return updateState();
  updateCheckPromise = (async () => {
    try {
      if (!updateReady) {
        updatePhase = "checking";
        updateError = "";
        notifyLocalUpdate();
      }
      await autoUpdater.checkForUpdates();
      lastUpdateCheckAt = Date.now();
      return updateState();
    } catch (error) {
      console.error("PDFRoot auto-update check:", error);
      updatePhase = "error";
      updateError = "Could not check for updates. Will retry automatically.";
      notifyLocalUpdate();
      return updateState();
    } finally {
      updateCheckPromise = undefined;
    }
  })();
  return updateCheckPromise;
}

function tryInstallDownloadedUpdate() {
  if (!updateReady || installingUpdate || activeAutoJob || queuedAutoShortcuts.length) return;
  // A tool or choice window can contain unsaved work. Install automatically
  // when the user exits PDFRoot instead of closing that window unexpectedly.
  const otherVisibleWindow = BrowserWindow.getAllWindows().some((window) =>
    window !== mainWindow && window !== localRendererWindow && !window.isDestroyed() && window.isVisible());
  if (otherVisibleWindow) {
    updatePhase = "waiting";
    notifyLocalUpdate();
    return;
  }
  installingUpdate = true;
  updatePhase = "installing";
  notifyLocalUpdate();
  appIsQuitting = true;
  try {
    autoUpdater.quitAndInstall(true, true);
  } catch (error) {
    installingUpdate = false;
    appIsQuitting = false;
    updatePhase = "error";
    updateError = "Automatic installation could not start. It will retry on exit.";
    console.error("PDFRoot auto-update install:", error);
    notifyLocalUpdate();
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged || process.platform !== "win32") return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.on("update-available", (info) => {
    availableUpdate = { version: info.version };
    updateReady = false;
    updatePhase = "downloading";
    updateProgress = 0;
    updateError = "";
    notifyLocalUpdate();
  });
  autoUpdater.on("download-progress", (progress) => {
    updatePhase = "downloading";
    updateProgress = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
    notifyLocalUpdate();
  });
  autoUpdater.on("update-downloaded", () => {
    updateReady = true;
    updatePhase = "ready";
    updateProgress = 100;
    notifyLocalUpdate();
    setTimeout(tryInstallDownloadedUpdate, 3000);
  });
  autoUpdater.on("update-not-available", () => {
    if (updateReady) return;
    availableUpdate = undefined;
    updatePhase = "current";
    updateError = "";
    notifyLocalUpdate();
  });
  autoUpdater.on("error", (error) => {
    console.error("PDFRoot auto-update:", error);
    updatePhase = "error";
    updateError = "Automatic update unavailable. PDFRoot will retry.";
    notifyLocalUpdate();
  });
}

async function checkPendingPayment() {
  if (!paymentClient?.baseUrl || (!paymentClient.readSession() && !accountClient?.session())) return { state: "none" };
  const result = await paymentClient.check();
  if (result.state === "active" && mainWindow?.webContents.getURL().endsWith("/activation.html")) {
    setTimeout(() => showCatalog(), 800);
  }
  return result;
}

function currentProcessingMode() {
  return desktopSettings.getProcessingMode();
}

function isPdfRootUrl(value) {
  try {
    return new URL(value).origin === new URL(WEB_APP_ORIGIN).origin;
  } catch {
    return false;
  }
}

function isTrustedPdfRootPage(event) {
  return isPdfRootUrl(event.senderFrame.url);
}

function toolUrl(slug) {
  const url = new URL(slug ? "/" + slug : "/tools", WEB_APP_ORIGIN);
  url.searchParams.set("desktop", "1");
  return url.toString();
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return types[extension] || "application/octet-stream";
}

function setPendingFiles(window, filePaths) {
  if (!window || window.isDestroyed()) return;
  pendingFilesByWebContents.set(window.webContents.id, Array.isArray(filePaths) ? filePaths.slice() : []);
}

function pendingFileSummary(webContentsId) {
  const files = pendingFilesByWebContents.get(webContentsId) || [];
  return files.map((filePath) => ({ name: path.basename(filePath), path: filePath }));
}

async function takePendingFiles(webContentsId) {
  const filesToRead = (pendingFilesByWebContents.get(webContentsId) || []).slice();
  pendingFilesByWebContents.delete(webContentsId);
  if (!filesToRead.length) return { files: [], warning: "" };

  const maximumTotalBytes = 45 * 1024 * 1024;
  let totalBytes = 0;
  const files = [];
  for (const filePath of filesToRead) {
    try {
      const info = await fs.promises.stat(filePath);
      if (!info.isFile() || info.size > maximumTotalBytes || totalBytes + info.size > maximumTotalBytes) continue;
      const data = await fs.promises.readFile(filePath);
      files.push({ name: path.basename(filePath), type: mimeTypeFor(filePath), data });
      totalBytes += data.length;
    } catch {
      // A file can be moved or blocked after it was selected in File Explorer.
    }
  }

  return {
    files,
    warning: files.length === filesToRead.length ? "" : "Some selected files were too large or could not be read. Choose them manually in the tool if needed.",
  };
}

function automaticClientScript(autoConfig) {
  const clientConfig = JSON.stringify({
    sectionIds: autoConfig.sectionIds,
    actionTexts: autoConfig.actionTexts,
    beforeActionTexts: autoConfig.beforeActionTexts,
    downloadText: autoConfig.downloadText,
  });

  return [
    "(() => {",
    "  const config = " + clientConfig + ";",
    "  const inputDeadline = Date.now() + 30000;",
    "  const resultDeadline = Date.now() + 150000;",
    "  const report = (phase, message) => {",
    "    try { window.pdfrootDesktop?.reportAutoStatus?.({ phase, message: String(message || '') }); } catch {}",
    "  };",
    "  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();",
    "  const later = (callback, delay) => window.setTimeout(callback, delay);",
    "  const findSection = () => (config.sectionIds || []).map((id) => document.getElementById(id)).find(Boolean);",
    "  const findActionButton = (section) => [...section.querySelectorAll('button')].find((button) => !button.disabled && (config.actionTexts || []).some((label) => normalize(button.textContent) === normalize(label)));",
    "  const findPresetButton = (section) => [...section.querySelectorAll('button')].find((button) => !button.disabled && (config.beforeActionTexts || []).some((label) => normalize(button.textContent) === normalize(label)));",
    "  const findDownloadLink = (section) => [...section.querySelectorAll('a[download]')].find((link) => normalize(link.textContent).includes('download'));",
    "  const waitForDownload = () => {",
    "    const section = findSection();",
    "    const link = section && findDownloadLink(section);",
    "    if (link) {",
    "      report('download-clicked', config.downloadText);",
    "      link.click();",
    "      return;",
    "    }",
    "    if (Date.now() >= resultDeadline) { report('error', 'The result took too long to prepare.'); return; }",
    "    later(waitForDownload, 350);",
    "  };",
    "  const waitForAction = () => {",
    "    const section = findSection();",
    "    const presetKey = 'pdfrootDesktopAutoPreset';",
    "    if ((config.beforeActionTexts || []).length && !document.body.dataset[presetKey]) {",
    "      const presetButton = section && findPresetButton(section);",
    "      if (presetButton) {",
    "        document.body.dataset[presetKey] = 'true';",
    "        report('preset', presetButton.textContent || 'Default preset');",
    "        presetButton.click();",
    "        later(waitForAction, 280);",
    "        return;",
    "      }",
    "      if (Date.now() >= inputDeadline) { report('error', 'The automatic default setting was not ready.'); return; }",
    "      later(waitForAction, 220);",
    "      return;",
    "    }",
    "    const button = section && findActionButton(section);",
    "    if (button) {",
    "      button.dataset.pdfrootDesktopAutoStarted = 'true';",
    "      report('processing', button.textContent || 'Processing');",
    "      button.click();",
    "      later(waitForDownload, 300);",
    "      return;",
    "    }",
    "    if (Date.now() >= inputDeadline) { report('error', 'The automatic action button was not ready.'); return; }",
    "    later(waitForAction, 220);",
    "  };",
    "  const importFiles = async () => {",
    "    const section = findSection();",
    "    const input = section && [...section.querySelectorAll('input[type=file]')].find((element) => !element.disabled);",
    "    if (!input) {",
    "      if (Date.now() >= inputDeadline) { report('error', 'The file area was not ready.'); return; }",
    "      later(() => { void importFiles(); }, 180);",
    "      return;",
    "    }",
    "    const transferResult = await window.pdfrootDesktop?.takePendingFiles?.();",
    "    const sourceFiles = transferResult?.files || [];",
    "    if (!sourceFiles.length) { report('error', 'The selected files could not be read.'); return; }",
    "    const dataTransfer = new DataTransfer();",
    "    const usableFiles = input.multiple ? sourceFiles : sourceFiles.slice(0, 1);",
    "    for (const source of usableFiles) {",
    "      const raw = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data?.data || source.data || []);",
    "      dataTransfer.items.add(new File([raw], source.name, { type: source.type || 'application/octet-stream' }));",
    "    }",
    "    input.files = dataTransfer.files;",
    "    input.dataset.pdfrootDesktopImported = 'true';",
    "    input.dispatchEvent(new Event('input', { bubbles: true }));",
    "    input.dispatchEvent(new Event('change', { bubbles: true }));",
    "    report('files-imported', usableFiles.length + ' file(s) imported');",
    "    later(waitForAction, 300);",
    "  };",
    "  void importFiles().catch((error) => report('error', error && error.message ? error.message : 'Automatic import failed.'));",
    "})();",
  ].join("\n");
}

async function injectDesktopBrandIntoPage(targetWindow, { mode = currentProcessingMode() } = {}) {
  if (!targetWindow || targetWindow.isDestroyed() || !isPdfRootUrl(targetWindow.webContents.getURL())) return;
  await targetWindow.webContents.executeJavaScript(desktopBrandInjectionScript({ mode }), true);
}

function refreshHostedBrand(targetWindow = mainWindow, mode = currentProcessingMode()) {
  injectDesktopBrandIntoPage(targetWindow, { mode }).catch(() => {
    // Branding is cosmetic. A hosted tool remains usable if its page blocks an injected badge.
  });
}

async function injectPendingFilesIntoPage(targetWindow, { autoConfig } = {}) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const webContentsId = targetWindow.webContents.id;
  if (!(pendingFilesByWebContents.get(webContentsId) || []).length) return;

  try {
    if (autoConfig) {
      await targetWindow.webContents.executeJavaScript(automaticClientScript(autoConfig), true);
      return;
    }

    await targetWindow.webContents.executeJavaScript([
      "(() => {",
      "  const deadline = Date.now() + 10000;",
      "  const usePendingFiles = async () => {",
      "    const input = [...document.querySelectorAll('input[type=\"file\"]')].find((element) => !element.disabled && !element.dataset.pdfrootDesktopImported);",
      "    if (!input) {",
      "      if (Date.now() < deadline) window.setTimeout(usePendingFiles, 180);",
      "      return;",
      "    }",
      "    const transferResult = await window.pdfrootDesktop?.takePendingFiles?.();",
      "    const sourceFiles = transferResult?.files || [];",
      "    if (!sourceFiles.length) return;",
      "    const dataTransfer = new DataTransfer();",
      "    const usableFiles = input.multiple ? sourceFiles : sourceFiles.slice(0, 1);",
      "    for (const source of usableFiles) {",
      "      const raw = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data?.data || source.data || []);",
      "      dataTransfer.items.add(new File([raw], source.name, { type: source.type || 'application/octet-stream' }));",
      "    }",
      "    input.files = dataTransfer.files;",
      "    input.dataset.pdfrootDesktopImported = 'true';",
      "    input.dispatchEvent(new Event('input', { bubbles: true }));",
      "    input.dispatchEvent(new Event('change', { bubbles: true }));",
      "    window.dispatchEvent(new CustomEvent('pdfroot-desktop-files-imported', { detail: { count: usableFiles.length, warning: transferResult.warning || '' } }));",
      "  };",
      "  usePendingFiles().catch(() => undefined);",
      "})();",
    ].join("\n"), true);
  } catch {
    // The selected tool can still be used manually if its hosted page changes.
  }
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  } catch {
    // Notifications are a convenience; a failed notification must not interrupt a job.
  }
}

function shortcutDisplay(shortcut, accelerator) {
  return displayAccelerator(accelerator || shortcutResults.get(shortcut.accelerator)?.effectiveAccelerator || shortcut.accelerator);
}

function publishShortcutActivity(shortcut, accelerator, phase, message) {
  const activity = lastShortcutActivity = {
    display: shortcutDisplay(shortcut, accelerator),
    label: shortcut.label,
    phase,
    message,
    at: new Date().toISOString(),
  };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:shortcut-activity", activity);
  return activity;
}

function reportShortcutHealth(payload) {
  const automatic = payload.filter((shortcut) => shortcut.auto);
  const unavailable = automatic.filter((shortcut) => !shortcut.registered);
  const fallback = automatic.filter((shortcut) => shortcut.usedFallback);
  const signature = [
    unavailable.map((shortcut) => shortcut.accelerator).join(","),
    fallback.map((shortcut) => shortcut.effectiveAccelerator).join(","),
  ].join("|");
  if (signature === shortcutHealthSignature) return;
  shortcutHealthSignature = signature;

  if (unavailable.length) {
    notify(
      "PDFRoot shortcut status",
      (automatic.length - unavailable.length) + " of " + automatic.length
        + " Auto shortcuts are ready. Open PDFRoot once and use the shown alternate key for unavailable shortcuts.",
    );
    return;
  }

  if (fallback.length) {
    notify(
      "PDFRoot shortcut status",
      automatic.length + " Auto shortcuts are ready. " + fallback.length
        + " use a Windows-safe alternate key shown in the shortcut list.",
    );
    return;
  }

  notify(
    "PDFRoot shortcut pack ready",
    automatic.length + " Auto shortcuts are ready. Select files in File Explorer and press a shortcut.",
  );
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(makeTrayMenu());
}

function setProcessingMode(mode) {
  const next = desktopSettings.setProcessingMode(mode);
  refreshTrayMenu();
  refreshHostedBrand(mainWindow, next);
  return next;
}

function toggleProcessingMode() {
  const next = desktopSettings.toggleProcessingMode();
  refreshTrayMenu();
  refreshHostedBrand(mainWindow, next);
  notify("PDFRoot Desktop Pro", next === PROCESSING_MODES.AUTO
    ? "Auto Mode ON: select files in File Explorer, then use any purple Auto shortcut. Results save beside the selected files."
    : "Normal Mode ON: shortcuts open the selected PDFRoot tool.");
  return next;
}

function cleanUpAutoWindow(job) {
  job.finished = true;
  const jobWindow = autoWindow;
  if (!jobWindow || jobWindow.isDestroyed() || job.webContentsId !== jobWindow.webContents.id) return;
  pendingFilesByWebContents.delete(job.webContentsId);
  autoWindow = undefined;
  jobWindow.destroy();
}

function finishAutoJob(job, { success, message, outputPath, outputPaths = [] } = {}) {
  if (!activeAutoJob || activeAutoJob.id !== job.id) return;
  clearTimeout(job.timeout);
  activeAutoJob = undefined;
  cleanUpAutoWindow(job);

  if (success) {
    const completedPaths = outputPaths.length ? outputPaths : outputPath ? [outputPath] : [];
    const savedName = completedPaths.length > 1
      ? completedPaths.length + " output files"
      : completedPaths[0] ? path.basename(completedPaths[0]) : "your output";
    const completionMessage = savedName + " saved in " + job.outputDirectory + (message ? " " + message : "");
    notify("PDFRoot Auto Mode complete", completionMessage);
    if (job.shortcut) publishShortcutActivity(job.shortcut, job.accelerator, "complete", completionMessage);
  } else {
    notify("PDFRoot Auto Mode", message || "The automatic task could not finish in the background.");
    if (job.shortcut) publishShortcutActivity(job.shortcut, job.accelerator, "failed", message || "Automatic task could not finish.");
  }
  setImmediate(() => { void drainAutoShortcutQueue(); });
}

function failAutoJob(job, message) {
  // Auto Mode is intentionally silent: a selected-file shortcut must never
  // reveal a website or a separate tool window. The notification and activity
  // line provide an actionable status if a background job cannot finish.
  finishAutoJob(job, { success: false, message });
}

function createAutoWindow(job) {
  const iconPath = resourcePath("icon.png");
  const jobWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#f8fafc",
    title: "PDFRoot Auto Mode",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  autoWindow = jobWindow;
  job.webContentsId = jobWindow.webContents.id;
  setPendingFiles(jobWindow, job.files);
  jobWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  jobWindow.on("closed", () => {
    pendingFilesByWebContents.delete(job.webContentsId);
    if (activeAutoJob && activeAutoJob.id === job.id && !job.finished) {
      failAutoJob(job, "The hidden Auto Mode window closed before the task finished.");
    }
  });
  jobWindow.webContents.once("did-finish-load", () => {
    if (!activeAutoJob || activeAutoJob.id !== job.id) return;
    refreshHostedBrand(jobWindow, PROCESSING_MODES.AUTO);
    injectPendingFilesIntoPage(jobWindow, { autoConfig: job.tool }).catch(() => {
      failAutoJob(job, "PDFRoot could not start the automatic task.");
    });
  });
  jobWindow.loadURL(toolUrl(job.slug)).catch(() => {
    failAutoJob(job, "PDFRoot could not open the online tool. Check the internet connection and try again.");
  });
}

function isCompressionChoiceOpen() {
  return Boolean(compressionChoiceWindow && !compressionChoiceWindow.isDestroyed());
}

function isImageChoiceOpen() {
  return Boolean(imageChoiceWindow && !imageChoiceWindow.isDestroyed());
}

function isPageOrderOpen() {
  return Boolean(pageOrderSession?.window && !pageOrderSession.window.isDestroyed());
}

function choosePageOrder(slug, files) {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 1220, height: 700, minWidth: 850, minHeight: 550,
      show: false, autoHideMenuBar: true, backgroundColor: "#f8fafc",
      title: "PDFRoot — Arrange PDF Pages", icon: resourcePath("icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    const choice = { window, slug, files: files.slice(), previewsPromise: undefined, previews: undefined };
    pageOrderSession = choice;
    let settled = false;
    const finish = (order) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:choose-page-order", onChoice);
      if (pageOrderSession === choice) pageOrderSession = undefined;
      if (!window.isDestroyed()) window.close();
      resolve(order);
    };
    const onChoice = (event, order) => {
      if (event.sender.id !== window.webContents.id) return;
      finish(choice.previews && validatePageOrder(order, choice.previews.pageCounts) ? order : undefined);
    };
    ipcMain.on("desktop:choose-page-order", onChoice);
    window.once("ready-to-show", () => { if (!settled && !window.isDestroyed()) window.show(); });
    window.on("closed", () => finish(undefined));
    window.loadFile(localUiPath("page-order-choice.html")).catch(() => finish(undefined));
  });
}

async function startPageOrderShortcut(slug, selectedFiles, shortcut, accelerator) {
  if (!currentLicenseStatus().ok) { showActivation(); return false; }
  if (activeAutoJob || isPageOrderOpen()) {
    if (isPageOrderOpen()) pageOrderSession.window.focus();
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Finish the open page preview or task first.");
    return false;
  }
  const selection = validateAutomaticSelection(slug, selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }
  if (shortcut) publishShortcutActivity(shortcut, accelerator, "choose-order", "Review and arrange all pages before creating the PDF.");
  const pageOrder = await choosePageOrder(slug, selection.files);
  if (!pageOrder) {
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "cancelled", "Page preview was closed without creating a PDF.");
    return false;
  }
  return startAutomaticTool(slug, selection.files, shortcut, accelerator, { pageOrder });
}

function chooseImageSetting(mode) {
  return new Promise((resolve) => {
    const choiceWindow = new BrowserWindow({
      width: 430, height: 330, resizable: false, minimizable: false,
      maximizable: false, fullscreenable: false, frame: false,
      show: false, skipTaskbar: true, alwaysOnTop: true,
      backgroundColor: "#f8fafc", title: "PDFRoot — Image setting",
      icon: resourcePath("icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    imageChoiceWindow = choiceWindow;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:choose-image-setting", onChoice);
      if (imageChoiceWindow === choiceWindow) imageChoiceWindow = undefined;
      if (!choiceWindow.isDestroyed()) choiceWindow.close();
      resolve(value);
    };
    const onChoice = (event, choice) => {
      if (event.sender.id !== choiceWindow.webContents.id) return;
      if (!choice) return finish(undefined);
      if (mode === "kb" && choice.type === "kb" && parseTargetKb(choice.value)) {
        return finish({ targetKb: parseTargetKb(choice.value) });
      }
      if (["ojas", "gpsc"].includes(mode) && choice.type === "date" && parsePhotoDate(choice.value)) {
        return finish({ photoDate: parsePhotoDate(choice.value).iso });
      }
      const slug = `${mode}-photo-resize`;
      if (choice.type === "kind" && IMAGE_PRESETS[slug]?.[choice.value]) {
        return finish({ imageKind: choice.value });
      }
    };
    ipcMain.on("desktop:choose-image-setting", onChoice);
    choiceWindow.once("ready-to-show", () => {
      if (settled || choiceWindow.isDestroyed()) return;
      choiceWindow.show();
      choiceWindow.focus();
    });
    choiceWindow.on("closed", () => finish(undefined));
    choiceWindow.loadFile(localUiPath("image-choice.html"), { query: { mode } }).catch(() => finish(undefined));
  });
}

async function startImageSettingsShortcut(slug, selectedFiles, shortcut, accelerator) {
  if (!currentLicenseStatus().ok) { showActivation(); return false; }
  if (activeAutoJob || isImageChoiceOpen()) {
    if (isImageChoiceOpen()) imageChoiceWindow.focus();
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Finish the open image setting or task first.");
    return false;
  }
  const selection = validateAutomaticSelection(slug, selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }
  const mode = slug === "resize-image-to-exact-kb" ? "kb" : slug.split("-")[0];
  if (shortcut) publishShortcutActivity(shortcut, accelerator, "choose-setting", "Choose the image setting and press Enter.");
  const options = await chooseImageSetting(mode);
  if (!options) {
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "cancelled", "Image setting was not selected.");
    return false;
  }
  return startAutomaticTool(slug, selection.files, shortcut, accelerator, options);
}

function isFrontBackChoiceOpen() {
  return Boolean(frontBackChoiceWindow && !frontBackChoiceWindow.isDestroyed());
}

function isCropOpen() {
  return Boolean(cropSession?.window && !cropSession.window.isDestroyed());
}

function revealCropWindow(window) {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createCropItems(files) {
  return files.map((filePath) => ({
    id: randomUUID(), filePath, originPath: filePath,
    kind: "original", source: undefined, saved: false,
  }));
}

function choosePdfCompressionLevel(fileCount) {
  if (isCompressionChoiceOpen()) {
    compressionChoiceWindow.focus();
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const iconPath = resourcePath("icon.png");
    const choiceWindow = new BrowserWindow({
      width: 430,
      height: 346,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#f8fafc",
      title: "PDFRoot — Compress PDF",
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    compressionChoiceWindow = choiceWindow;
    let settled = false;

    const finish = (level) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:choose-pdf-compression", onChoice);
      if (compressionChoiceWindow === choiceWindow) compressionChoiceWindow = undefined;
      if (!choiceWindow.isDestroyed()) choiceWindow.close();
      resolve(level);
    };
    const onChoice = (event, level) => {
      if (event.sender.id !== choiceWindow.webContents.id) return;
      finish(Object.prototype.hasOwnProperty.call(PDF_COMPRESSION_PRESETS, level) ? level : undefined);
    };

    ipcMain.on("desktop:choose-pdf-compression", onChoice);
    choiceWindow.once("ready-to-show", () => {
      if (settled || choiceWindow.isDestroyed()) return;
      choiceWindow.show();
      choiceWindow.focus();
    });
    choiceWindow.on("closed", () => finish(undefined));
    choiceWindow.loadFile(localUiPath("compression-choice.html"), {
      query: { files: String(Math.max(1, Number(fileCount) || 1)) },
    }).catch(() => finish(undefined));
  });
}

async function startCompressionShortcut(selectedFiles, shortcut, accelerator) {
  if (!currentLicenseStatus().ok) {
    showActivation();
    return false;
  }
  if (activeAutoJob) {
    notify("PDFRoot Auto Mode", "One automatic task is already running. Please wait for it to finish.");
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Another automatic task is still running.");
    return false;
  }
  if (isCompressionChoiceOpen()) {
    if (isCompressionChoiceOpen()) compressionChoiceWindow.focus();
    else if (isFrontBackChoiceOpen()) frontBackChoiceWindow.focus();
    else if (isImageChoiceOpen()) imageChoiceWindow.focus();
    else if (isPageOrderOpen()) pageOrderSession.window.focus();
    else cropSession.window.focus();
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "choice-open", "Finish the open PDFRoot choice first.");
    return false;
  }

  const selection = validateAutomaticSelection("compress-pdf", selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }

  if (shortcut) publishShortcutActivity(shortcut, accelerator, "choose-level", "Choose Normal, Low, or Heavy compression.");
  const compressionLevel = await choosePdfCompressionLevel(selection.files.length);
  if (!compressionLevel) {
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "cancelled", "PDF compression level was not selected.");
    return false;
  }
  return startAutomaticTool("compress-pdf", selection.files, shortcut, accelerator, { compressionLevel });
}

function chooseFrontBackOrder(files) {
  return new Promise((resolve) => {
    const choiceWindow = new BrowserWindow({
      width: 590,
      height: 650,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#f8fafc",
      title: "PDFRoot — Front & Back Order",
      icon: resourcePath("icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    frontBackChoiceWindow = choiceWindow;
    frontBackChoiceFiles = files.slice();
    let settled = false;

    const finish = (orderedFiles) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("desktop:choose-front-back-order", onChoice);
      if (frontBackChoiceWindow === choiceWindow) {
        frontBackChoiceWindow = undefined;
        frontBackChoiceFiles = undefined;
      }
      if (!choiceWindow.isDestroyed()) choiceWindow.close();
      resolve(orderedFiles);
    };
    const onChoice = (event, order) => {
      if (event.sender.id !== choiceWindow.webContents.id) return;
      if (!Array.isArray(order) || order.length !== 2 ||
          !Number.isInteger(order[0]) || !Number.isInteger(order[1]) ||
          order[0] + order[1] !== 1 || order[0] === order[1]) {
        finish(undefined);
        return;
      }
      finish(order.map((index) => files[index]));
    };

    ipcMain.on("desktop:choose-front-back-order", onChoice);
    choiceWindow.once("ready-to-show", () => {
      if (settled || choiceWindow.isDestroyed()) return;
      choiceWindow.show();
      choiceWindow.focus();
    });
    choiceWindow.on("closed", () => finish(undefined));
    choiceWindow.loadFile(localUiPath("front-back-choice.html")).catch(() => finish(undefined));
  });
}

async function startFrontBackShortcut(selectedFiles, shortcut, accelerator) {
  if (!currentLicenseStatus().ok) {
    showActivation();
    return false;
  }
  if (activeAutoJob || isFrontBackChoiceOpen()) {
    if (isFrontBackChoiceOpen()) frontBackChoiceWindow.focus();
    else if (isCompressionChoiceOpen()) compressionChoiceWindow.focus();
    else if (isCropOpen()) cropSession.window.focus();
    else if (isImageChoiceOpen()) imageChoiceWindow.focus();
    else if (isPageOrderOpen()) pageOrderSession.window.focus();
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Finish the current PDFRoot task or choice first.");
    return false;
  }
  const selection = validateAutomaticSelection("front-back-card-merge", selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }
  if (shortcut) publishShortcutActivity(shortcut, accelerator, "choose-order", "Check both images, swap if needed, then click Merge.");
  const orderedFiles = await chooseFrontBackOrder(selection.files);
  if (!orderedFiles) {
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "cancelled", "Front and back merge was cancelled.");
    return false;
  }
  return startAutomaticTool("front-back-card-merge", orderedFiles, shortcut, accelerator, {
    outputDirectory: path.dirname(selection.files[0]),
  });
}

async function startCropShortcut(selectedFiles, shortcut, accelerator) {
  if (!currentLicenseStatus().ok) {
    showActivation();
    return false;
  }
  if (activeAutoJob) {
    if (isImageChoiceOpen()) imageChoiceWindow.focus();
    else if (isPageOrderOpen()) pageOrderSession.window.focus();
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Finish the open PDFRoot task or preview first.");
    return false;
  }
  const selection = validateAutomaticSelection("crop-image", selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }
  if (isCropOpen()) {
    const session = cropSession;
    revealCropWindow(session.window);
    if (session.saving) {
      if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Please wait for the current cropped image to finish saving.");
      return false;
    }
    session.items = createCropItems(selection.files);
    session.shortcut = shortcut;
    session.accelerator = accelerator;
    session.savedCount = 0;
    session.window.webContents.send("desktop:crop-replace-items",
      session.items.map((item) => ({ id: item.id, name: path.basename(item.filePath), kind: item.kind, saved: false })));
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "editing", `${selection.files.length} new image(s) loaded in Crop Image.`);
    return true;
  }
  const choiceWindow = new BrowserWindow({
    width: 1060,
    height: 680,
    minWidth: 850,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    title: "PDFRoot — Crop Image",
    icon: resourcePath("icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  cropSession = {
    window: choiceWindow,
    items: createCropItems(selection.files),
    shortcut, accelerator,
    saving: false,
    savedCount: 0,
  };
  if (shortcut) publishShortcutActivity(shortcut, accelerator, "editing", `${selection.files.length} image(s) ready for crop. Copies save as separate files.`);
  choiceWindow.once("ready-to-show", () => {
    revealCropWindow(choiceWindow);
  });
  choiceWindow.on("closed", () => {
    if (cropSession?.window !== choiceWindow) return;
    if (!cropSession.savedCount && shortcut) publishShortcutActivity(shortcut, accelerator, "cancelled", "Crop was cancelled; original images were not changed.");
    cropSession = undefined;
  });
  choiceWindow.loadFile(localUiPath("crop-choice.html")).catch((error) => {
    notify("PDFRoot Crop Image", `Could not open the crop editor: ${error.message}`);
    if (!choiceWindow.isDestroyed()) choiceWindow.close();
  });
  return true;
}

async function startAutomaticTool(slug, selectedFiles, shortcut, accelerator, localOptions = {}) {
  if (!currentLicenseStatus().ok) {
    showActivation();
    return false;
  }
  if (activeAutoJob) {
    notify("PDFRoot Auto Mode", "One automatic task is already running. Please wait for it to finish.");
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "busy", "Another automatic task or compression choice is already open.");
    return false;
  }

  const selection = validateAutomaticSelection(slug, selectedFiles);
  if (!selection.ok) {
    notify("PDFRoot Auto Mode", selection.message);
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
    return false;
  }

  const outputDirectory = localOptions.outputDirectory || path.dirname(selection.files[0]);
  const job = {
    id: ++autoJobNumber,
    slug,
    tool: selection.tool,
    files: selection.files,
    outputDirectory,
    webContentsId: undefined,
    finished: false,
    timeout: undefined,
    shortcut,
    accelerator,
    compressionLevel: slug === "compress-pdf" && Object.prototype.hasOwnProperty.call(PDF_COMPRESSION_PRESETS, localOptions.compressionLevel)
      ? localOptions.compressionLevel
      : "normal",
    targetKb: localOptions.targetKb,
    imageKind: localOptions.imageKind,
    photoDate: localOptions.photoDate,
    pageOrder: localOptions.pageOrder,
  };
  activeAutoJob = job;
  job.timeout = setTimeout(() => {
    failAutoJob(job, job.tool.label + " took too long. Try again in Normal Mode.");
  }, AUTO_JOB_TIMEOUT_MS);
  const compressionNote = slug === "compress-pdf"
    ? " " + PDF_COMPRESSION_PRESETS[job.compressionLevel].label + " compression selected."
    : "";
  const presetNote = job.tool.autoDescription ? " Using " + job.tool.autoDescription + "." : "";
  notify("PDFRoot Auto Mode", job.tool.label + " started in the background." + compressionNote + presetNote + " The finished file will save in " + outputDirectory + ".");
  if (shortcut) publishShortcutActivity(shortcut, accelerator, "processing", "Background processing started. No tool window will open.");

  try {
    const localResult = await processLocalAutoJob({
      slug,
      files: selection.files,
      outputDirectory,
      renderPdfToJpg,
      compressionLevel: job.compressionLevel,
      targetKb: job.targetKb,
      imageKind: job.imageKind,
      photoDate: job.photoDate,
      pageOrder: job.pageOrder,
    });
    if (!activeAutoJob || activeAutoJob.id !== job.id) return false;
    if (localResult.handled) {
      finishAutoJob(job, {
        success: true,
        outputPaths: localResult.outputPaths,
        message: localResult.warnings?.join(" ") || "",
      });
      return true;
    }
  } catch (error) {
    if (error instanceof LocalAutoUnavailableError && localAutoSlugs.has(slug)) {
      failAutoJob(job, error.message);
      return false;
    }
    if (!(error instanceof LocalAutoUnavailableError)) {
      failAutoJob(job, job.tool.label + " could not write the local result. Check that the selected folder is available and try again.");
      return false;
    }
    if (shortcut) publishShortcutActivity(shortcut, accelerator, "processing", "Using the hidden background converter. No tool window will open.");
  }

  // A small set of document-conversion workflows needs the online PDFRoot
  // engine. It remains fully hidden and downloads directly into this folder.
  createAutoWindow(job);
  return true;
}

function setupAutomaticDownloadHandler() {
  session.defaultSession.on("will-download", (_event, item, webContents) => {
    const job = activeAutoJob;
    if (!job || job.webContentsId !== webContents.id) return;

    const outputPath = nextAvailableOutputPath(job.outputDirectory, item.getFilename());
    item.setSavePath(outputPath);
    item.once("done", (_downloadEvent, state) => {
      if (!activeAutoJob || activeAutoJob.id !== job.id) return;
      if (state === "completed") {
        finishAutoJob(job, { success: true, outputPath });
      } else {
        failAutoJob(job, "The automatic download was " + state + ".");
      }
    });
  });
}

function handleAutoStatus(event, payload) {
  if (!isTrustedPdfRootPage(event)) return;
  const job = activeAutoJob;
  if (!job || event.sender.id !== job.webContentsId) return;

  if (payload && typeof payload.phase === "string" && job.shortcut) {
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "Automatic task is running.";
    publishShortcutActivity(job.shortcut, job.accelerator, payload.phase, message);
  }

  if (payload && payload.phase === "error") {
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "The automatic task could not finish.";
    failAutoJob(job, message);
  }
}

async function showActivation() {
  bringToFront();
  await mainWindow.loadFile(localUiPath("activation.html"));
}

async function showCatalog() {
  if (!currentLicenseStatus().ok) return showActivation();
  bringToFront();
  await mainWindow.loadFile(localUiPath("catalog.html"));
}

async function openTool(slug, selectedFiles = []) {
  if (!currentLicenseStatus().ok) return showActivation();
  if (!slug || !getTool(slug)) return showCatalog();
  if (selectedFiles.length) setPendingFiles(mainWindow, selectedFiles);
  bringToFront();
  await mainWindow.loadURL(toolUrl(slug));
  await injectDesktopBrandIntoPage(mainWindow);
  if (selectedFiles.length) await injectPendingFilesIntoPage(mainWindow);
}

function setupAdFreeDesktopSession() {
  const adPatterns = [
    "https://pagead2.googlesyndication.com/*",
    "https://googleads.g.doubleclick.net/*",
    "https://tpc.googlesyndication.com/*",
  ];

  session.defaultSession.webRequest.onBeforeRequest({ urls: adPatterns }, (_details, callback) => callback({ cancel: true }));
}

function makeTrayMenu() {
  const autoMode = currentProcessingMode() === PROCESSING_MODES.AUTO;
  const items = [
    { label: "Open PDFRoot Desktop Pro", click: () => showCatalog() },
    { label: "All Tools  (Ctrl + Alt + R)", click: () => showCatalog() },
    {
      label: autoMode ? "Auto Mode: ON  (Ctrl + Alt + A)" : "Normal Mode: ON  (Ctrl + Alt + A)",
      click: () => toggleProcessingMode(),
    },
    { type: "separator" },
    ...quickShortcuts.filter((item) => item.slug).slice(0, 6).map((item) => ({
      label: item.label + "  (" + (shortcutResults.get(item.accelerator)?.effectiveDisplay || item.display) + ")",
      click: () => openTool(item.slug),
    })),
    { type: "separator" },
    { label: "Manage License", click: () => showActivation() },
    { label: "Exit PDFRoot", click: () => { appIsQuitting = true; app.quit(); } },
  ];
  return Menu.buildFromTemplate(items);
}

function createTray() {
  const icon = nativeImage.createFromPath(resourcePath("icon.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("PDFRoot Desktop Pro");
  refreshTrayMenu();
  tray.on("click", () => showCatalog());
}

async function runShortcut(shortcut, accelerator) {
  const display = shortcutDisplay(shortcut, accelerator);
  publishShortcutActivity(shortcut, accelerator, "detected", display + " detected.");

  if (shortcut.action === "catalog") {
    notify("PDFRoot shortcut", display + " detected. Opening all tools.");
    publishShortcutActivity(shortcut, accelerator, "opened", "All PDFRoot tools opened.");
    showCatalog();
    return true;
  }
  if (shortcut.action === "toggle-auto-mode") {
    toggleProcessingMode();
    publishShortcutActivity(shortcut, accelerator, "mode", currentProcessingMode() === PROCESSING_MODES.AUTO ? "Auto Mode is ON." : "Normal Mode is ON.");
    return true;
  }

  publishShortcutActivity(shortcut, accelerator, "reading-selection", "Reading the selected File Explorer files.");
  if (!currentLicenseStatus().ok) { await showActivation(); return false; }
  let selectedFiles = await getFocusedExplorerSelection();
  if (!selectedFiles.length) selectedFiles = await chooseToolFiles(shortcut.slug);
  if (!selectedFiles.length) {
    publishShortcutActivity(shortcut, accelerator, "cancelled", "No files were chosen.");
    return false;
  }
  if (currentProcessingMode() === PROCESSING_MODES.AUTO && automaticTools[shortcut.slug]) {
    if (activeAutoJob) {
      const selection = validateAutomaticSelection(shortcut.slug, selectedFiles);
      if (!selection.ok) {
        notify("PDFRoot Auto Mode", selection.message);
        publishShortcutActivity(shortcut, accelerator, "needs-files", selection.message);
        return false;
      }
      const alreadyQueued = queuedAutoShortcuts.some((item) => item.shortcut.slug === shortcut.slug
        && item.files.length === selection.files.length
        && item.files.every((file, index) => file === selection.files[index]));
      if (!alreadyQueued) queuedAutoShortcuts.push({ shortcut, accelerator, files: selection.files });
      publishShortcutActivity(shortcut, accelerator, "queued", "Selected files are queued; processing starts when the current conversion finishes.");
      return true;
    }
    return dispatchAutoShortcut(shortcut, accelerator, selectedFiles);
  }

  notify("PDFRoot shortcut", display + " detected. Opening " + shortcut.label + ".");
  publishShortcutActivity(shortcut, accelerator, "opened", shortcut.label + " opened in Normal Mode.");
  await openTool(shortcut.slug, selectedFiles);
  return true;
}

function dispatchAutoShortcut(shortcut, accelerator, files) {
  if (["jpg-to-pdf", "png-to-pdf", "merge-pdf"].includes(shortcut.slug)) {
    return startPageOrderShortcut(shortcut.slug, files, shortcut, accelerator);
  }
  if (shortcut.slug === "crop-image") return startCropShortcut(files, shortcut, accelerator);
  if (shortcut.slug === "compress-pdf") return startCompressionShortcut(files, shortcut, accelerator);
  if (shortcut.slug === "front-back-card-merge") return startFrontBackShortcut(files, shortcut, accelerator);
  if (["resize-image-to-exact-kb", "ojas-photo-resize", "gpsc-photo-resize", "ssc-photo-resize", "ibps-photo-resize", "upsc-photo-resize"].includes(shortcut.slug)) {
    return startImageSettingsShortcut(shortcut.slug, files, shortcut, accelerator);
  }
  return startAutomaticTool(shortcut.slug, files, shortcut, accelerator);
}

async function chooseToolFiles(slug) {
  const tool = getTool(slug);
  const group = contextToolGroup(slug);
  const filters = group === "pdf" ? [{ name: "PDF files", extensions: ["pdf"] }]
    : group === "image" ? [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] }]
    : [{ name: "All files", extensions: ["*"] }];
  const result = await dialog.showOpenDialog({ title: `Select files for ${tool?.name || "PDFRoot"}`,
    properties: ["openFile", "multiSelections"], filters });
  return result.canceled ? [] : result.filePaths;
}

async function runContextTool(slug, explicitFiles = [], capturedFiles) {
  if (slug === "catalog") { await showCatalog(); return true; }
  const tool = getTool(slug);
  if (!tool) { await showCatalog(); return false; }
  if (!currentLicenseStatus().ok) { await showActivation(); return false; }

  const explorerFiles = capturedFiles || await getFocusedExplorerSelection({ anchor: explicitFiles[0] });
  let selectedFiles = resolveLaunchSelection(explorerFiles, explicitFiles);
  if (!selectedFiles.length) selectedFiles = await chooseToolFiles(slug);
  if (!selectedFiles.length) return false;
  if (!contextToolAcceptsFiles(slug, selectedFiles)) {
    const expectedType = contextToolGroup(slug) === "pdf" ? "PDF" : "image";
    await dialog.showMessageBox({ type: "info", title: tool.name,
      message: `${tool.name} needs ${expectedType} files.`, detail: "Choose the required files to continue.", buttons: ["Choose files", "Cancel"] })
      .then(async result => { selectedFiles = result.response === 0 ? await chooseToolFiles(slug) : []; });
    if (!selectedFiles.length || !contextToolAcceptsFiles(slug, selectedFiles)) return false;
  }
  notify("PDFRoot Desktop Pro", `${tool.name} started from the File Explorer right-click menu.`);
  if (currentProcessingMode() === PROCESSING_MODES.AUTO && automaticTools[slug]) {
    return dispatchAutoShortcut({ slug, label: tool.name }, "Right-click menu", selectedFiles);
  }
  await openTool(slug, selectedFiles);
  return true;
}

async function drainAutoShortcutQueue() {
  if (drainingAutoShortcuts || activeAutoJob) return;
  drainingAutoShortcuts = true;
  try {
    while (!activeAutoJob && queuedAutoShortcuts.length) {
      const { shortcut, accelerator, files } = queuedAutoShortcuts.shift();
      try {
        await dispatchAutoShortcut(shortcut, accelerator, files);
      } catch (error) {
        const message = `${shortcut.label} could not start: ${error.message || "unknown error"}`;
        notify("PDFRoot shortcut", message);
        publishShortcutActivity(shortcut, accelerator, "failed", message);
      }
    }
  } finally {
    drainingAutoShortcuts = false;
    if (!activeAutoJob && queuedAutoShortcuts.length) setImmediate(() => { void drainAutoShortcutQueue(); });
  }
}

function startShortcut(shortcut, accelerator) {
  // Chromium can deliver the same key through both globalShortcut and the
  // focused PDFRoot window. Keep the local fallback active without running a
  // destructive file operation twice.
  const now = Date.now();
  if (now - (recentShortcutKeys.get(accelerator) || 0) < 200) return;
  recentShortcutKeys.set(accelerator, now);
  void runShortcut(shortcut, accelerator).catch(() => {
    const display = shortcutDisplay(shortcut, accelerator);
    const message = display + " could not start. Keep File Explorer active, select the required files, then press the key again.";
    notify("PDFRoot shortcut", message);
    publishShortcutActivity(shortcut, accelerator, "failed", message);
  });
}

function shortcutPayload() {
  return quickShortcuts.map((shortcut) => {
    const registration = shortcutResults.get(shortcut.accelerator);
    return {
      ...shortcut,
      auto: Boolean(shortcut.slug && automaticTools[shortcut.slug]),
      autoDescription: shortcut.slug && automaticTools[shortcut.slug]?.autoDescription || "",
      registered: registration?.registered ?? false,
      effectiveAccelerator: registration?.effectiveAccelerator || null,
      effectiveDisplay: registration?.effectiveDisplay || shortcut.display,
      usedFallback: registration?.usedFallback ?? false,
      alternateAccelerators: registration?.alternateAccelerators || [],
      alternateDisplays: registration?.alternateDisplays || [],
    };
  });
}

function registerShortcuts() {
  const nextResults = registerShortcutSet({
    shortcuts: quickShortcuts,
    register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
    unregisterAll: () => globalShortcut.unregisterAll(),
    handler: startShortcut,
  });
  shortcutResults.clear();
  for (const [accelerator, result] of nextResults.entries()) shortcutResults.set(accelerator, result);
  refreshTrayMenu();
  const payload = shortcutPayload();
  reportShortcutHealth(payload);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:shortcuts-updated", payload);
  return payload;
}

function retryUnavailableShortcuts() {
  clearInterval(shortcutRetryTimer);
  if (!shortcutPayload().some((shortcut) => !shortcut.registered)) return;
  shortcutRetryTimer = setInterval(() => {
    if (!shortcutPayload().some((shortcut) => !shortcut.registered)) {
      clearInterval(shortcutRetryTimer);
      shortcutRetryTimer = undefined;
      return;
    }
    registerShortcuts();
  }, 15000);
}

function shortcutFromWindowInput(input) {
  if (!input || input.type !== "keyDown" || !input.control) return null;
  const key = String(input.key || "").length === 1 ? String(input.key).toUpperCase() : String(input.key || "");
  if (!key) return null;
  const accelerators = [];
  if (input.alt) accelerators.push(["Control", "Alt", input.shift ? "Shift" : null, key].filter(Boolean).join("+"));
  if (input.shift && !input.alt) accelerators.push(["Control", "Shift", key].join("+"));

  for (const accelerator of accelerators) {
    const shortcut = quickShortcuts.find((item) => item.accelerator === accelerator
      || item.fallbackAccelerator === accelerator
      || item.backupAccelerator === accelerator);
    if (shortcut) return { shortcut, accelerator };
  }
  return null;
}

function handleWindowShortcut(event, input) {
  const match = shortcutFromWindowInput(input);
  if (!match) return;
  // Windows may route a registered key to the focused PDFRoot tool window
  // instead of the global hook. Handle either route, with deduplication above.
  event.preventDefault();
  startShortcut(match.shortcut, match.accelerator);
}

function setupIpc() {
  ipcMain.handle("desktop:update-status", (event) => isLocalAppPage(event) ? updateState() : { error: "Open PDFRoot to check updates." });
  ipcMain.handle("desktop:check-update", (event) => isLocalAppPage(event)
    ? checkForDesktopUpdate(true) : { error: "Open PDFRoot to check updates." });
  ipcMain.handle("desktop:license-status", () => currentLicenseStatus());
  ipcMain.handle("desktop:activate", (_event, code) => {
    const result = licenseStore.activate(code);
    if (result.ok) setTimeout(() => showCatalog(), 450);
    return { ...result, deviceId };
  });
  ipcMain.handle("desktop:payment-available", (event) => isActivationPage(event) && Boolean(paymentClient?.baseUrl));
  ipcMain.handle("desktop:account-status", (event) => {
    const account = accountClient?.session();
    return isActivationPage(event)
      ? { email: account?.email || null, name: account?.name || null, provider: account?.provider || "email" }
      : { email: null };
  });
  ipcMain.handle("desktop:account-summary", async (event) => {
    if (!isLocalAppPage(event)) return { error: "Open PDFRoot to view your plan." };
    try { return await accountClient.summary(); } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle("desktop:send-login-code", async (event, email) => {
    if (!isActivationPage(event)) return { error: "Open PDFRoot to sign in." };
    try { return await accountClient.sendCode(email); } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle("desktop:verify-login-code", async (event, email, code) => {
    if (!isActivationPage(event)) return { error: "Open PDFRoot to sign in." };
    try { return await accountClient.verifyCode(email, code); } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle("desktop:google-sign-in", async (event, plan) => {
    if (!isActivationPage(event)) return { error: "Open PDFRoot to sign in." };
    try {
      return await signInWithGoogle({
        clientId: googleClientId(resourcePath("payment-api.json")),
        openExternal: (url) => shell.openExternal(url),
        onCallback: bringToFront,
        exchange: async (idToken, nonce) => {
          const account = await accountClient.googleSignIn(idToken, nonce);
          if (plan !== "paid") return account;
          try {
            const name = account.name || account.email.split("@")[0].replace(/[._-]+/g, " ").trim() || "PDFRoot customer";
            return { ...account, payment: await paymentClient.checkout(name) };
          } catch (error) { return { ...account, paymentError: error.message }; }
        },
      });
    } catch (error) { bringToFront(); return { error: error.message }; }
  });
  ipcMain.handle("desktop:start-trial", async (event) => {
    if (!isActivationPage(event)) return { error: "Open PDFRoot to start the trial." };
    try {
      const status = await accountClient.startTrial();
      setTimeout(() => showCatalog(), 450);
      return { ...status, deviceId };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle("desktop:start-payment", async (event, name) => {
    if (!isActivationPage(event)) return { error: "Open the activation screen to pay." };
    try {
      const result = await paymentClient.checkout(name);
      await shell.openExternal(result.paymentUrl);
      return { ok: true, amountPaise: result.amountPaise, currency: result.currency, expiresAt: result.expiresAt };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle("desktop:check-payment", async (event) => {
    if (!isActivationPage(event)) return { state: "none" };
    try { return await checkPendingPayment(); }
    catch (error) { return { state: "error", message: error.message }; }
  });
  ipcMain.handle("desktop:copy-device-id", () => {
    clipboard.writeText(deviceId);
    return true;
  });
  ipcMain.handle("desktop:open-catalog", () => showCatalog());
  ipcMain.handle("desktop:open-tool", (_event, slug) => openTool(slug));
  ipcMain.handle("desktop:tools", () => tools);
  ipcMain.handle("desktop:pending-files", (event) => isTrustedPdfRootPage(event) ? takePendingFiles(event.sender.id) : { files: [], warning: "" });
  ipcMain.handle("desktop:pending-file-summary", (event) => isTrustedPdfRootPage(event) ? pendingFileSummary(event.sender.id) : []);
  ipcMain.handle("desktop:page-order-previews", async (event) => {
    const choice = pageOrderSession;
    if (!choice || choice.window.isDestroyed() || event.sender.id !== choice.window.webContents.id) return { error: "The page preview is no longer open." };
    try {
      choice.previewsPromise ||= createPagePreviews(choice.slug, choice.files, renderPdfToJpg);
      const previews = await choice.previewsPromise;
      if (pageOrderSession !== choice) return { error: "The page preview was closed." };
      choice.previews = previews;
      return { slug: choice.slug, pages: previews.pages, warnings: previews.warnings };
    } catch (error) {
      return { error: error.message || "Could not read the selected pages." };
    }
  });
  ipcMain.handle("desktop:front-back-previews", async (event) => {
    if (!isFrontBackChoiceOpen() || event.sender.id !== frontBackChoiceWindow.webContents.id || !frontBackChoiceFiles) return null;
    try {
      return { images: await frontBackPreviews(frontBackChoiceFiles) };
    } catch {
      return { error: "Could not preview both images. Check the selected files and try again." };
    }
  });
  ipcMain.handle("desktop:crop-items", (event) => {
    if (!isCropOpen() || event.sender.id !== cropSession.window.webContents.id) return [];
    return cropSession.items.map((item) => ({ id: item.id, name: path.basename(item.filePath), kind: item.kind, saved: item.saved }));
  });
  ipcMain.handle("desktop:crop-add-images", async (event) => {
    if (!isCropOpen() || event.sender.id !== cropSession.window.webContents.id) return [];
    const session = cropSession;
    const result = await dialog.showOpenDialog(session.window, {
      title: "Add images to crop",
      buttonLabel: "Add images",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    if (result.canceled || session !== cropSession) return [];
    const added = [];
    for (const filePath of result.filePaths) {
      if (!/\.(jpe?g|png|webp)$/i.test(filePath) ||
          session.items.some((item) => item.kind === "original" && item.filePath.toLowerCase() === filePath.toLowerCase())) continue;
      if (session.items.length >= 100) break;
      const item = { id: randomUUID(), filePath, originPath: filePath, kind: "original", source: undefined, saved: false };
      session.items.push(item);
      added.push({ id: item.id, name: path.basename(filePath), kind: item.kind, saved: false });
    }
    return added;
  });
  ipcMain.handle("desktop:crop-copy-image", (event, id) => {
    if (!isCropOpen() || event.sender.id !== cropSession.window.webContents.id) return { error: "Crop editor is no longer open." };
    const session = cropSession;
    const index = session.items.findIndex((item) => item.id === id);
    const base = session.items[index];
    if (!base?.source || session.items.length >= 100) return { error: "Load an image first (100 items maximum)." };
    const seedSource = base.seedSource || base.source;
    const originPath = base.originPath || base.filePath;
    const copy = { id: randomUUID(), filePath: originPath, originPath, kind: "copy", source: seedSource, seedSource, saved: false };
    session.items.splice(index + 1, 0, copy);
    return { id: copy.id, name: path.basename(copy.filePath), kind: copy.kind, saved: false };
  });
  ipcMain.handle("desktop:crop-source", async (event, id) => {
    if (!isCropOpen() || event.sender.id !== cropSession.window.webContents.id) return { error: "Crop editor is no longer open." };
    const session = cropSession;
    const item = session.items.find((candidate) => candidate.id === id);
    if (!item) return { error: "The selected crop item is no longer available." };
    try {
      if (!item.source) {
        item.source = await cropSource(item.filePath);
        item.seedSource = item.source;
      }
      if (session !== cropSession) return { error: "Crop editor was closed." };
      return item.source;
    } catch (error) {
      return { error: error.message || "Could not read the selected image." };
    }
  });
  ipcMain.handle("desktop:crop-save", async (event, payload) => {
    if (!isCropOpen() || event.sender.id !== cropSession.window.webContents.id) return { ok: false, message: "Crop editor is no longer ready." };
    const session = cropSession;
    const item = session.items.find((candidate) => candidate.id === payload?.id);
    if (!item?.source || session.saving || item.saved) return { ok: false, message: "Load this image first, or choose an unsaved item." };
    session.saving = true;
    try {
      const options = { decodeWebp: (bytes) => nativeImage.createFromBuffer(bytes).getSize() };
      const result = item.kind === "copy"
        ? await saveCroppedCopy(item.filePath, payload, options)
        : await replaceCroppedImage(item.filePath, payload, item.source, options);
      item.saved = true;
      session.savedCount += 1;
      const filename = path.basename(result.outputPath || item.filePath);
      if (result.outputPath) item.filePath = result.outputPath;
      item.source = { ...item.source, name: filename, dataUrl: payload.dataUrl };
      const sizeKb = result.bytes / 1024;
      const sizeLabel = Number.isInteger(sizeKb) ? `${sizeKb} KB` : `${sizeKb.toFixed(1)} KB`;
      const message = `${filename} saved in its original folder (${result.width} × ${result.height}, ${sizeLabel}).`;
      notify("PDFRoot Crop Image complete", message);
      if (session.shortcut) publishShortcutActivity(session.shortcut, session.accelerator, "complete", message);
      return { ok: true, message, filename };
    } catch (error) {
      return { ok: false, message: error.message || "Could not replace the selected image." };
    } finally {
      session.saving = false;
    }
  });
  ipcMain.on("desktop:crop-close", (event) => {
    if (isCropOpen() && event.sender.id === cropSession.window.webContents.id) cropSession.window.close();
  });
  ipcMain.handle("desktop:shortcuts", () => shortcutPayload());
  ipcMain.handle("desktop:shortcut-activity", () => lastShortcutActivity || null);
  ipcMain.handle("desktop:refresh-shortcuts", () => ({
    shortcuts: registerShortcuts(),
  }));
  ipcMain.handle("desktop:processing-mode", () => ({
    mode: currentProcessingMode(),
    automaticTools: Object.keys(automaticTools),
    automaticShortcutCount: quickShortcuts.filter((shortcut) => shortcut.slug && automaticTools[shortcut.slug]).length,
  }));
  ipcMain.handle("desktop:set-processing-mode", (_event, mode) => ({
    mode: setProcessingMode(mode),
    automaticTools: Object.keys(automaticTools),
    automaticShortcutCount: quickShortcuts.filter((shortcut) => shortcut.slug && automaticTools[shortcut.slug]).length,
  }));
  ipcMain.handle("desktop:toggle-processing-mode", () => ({
    mode: toggleProcessingMode(),
    automaticTools: Object.keys(automaticTools),
    automaticShortcutCount: quickShortcuts.filter((shortcut) => shortcut.slug && automaticTools[shortcut.slug]).length,
  }));
  ipcMain.on("desktop:auto-status", handleAutoStatus);
  ipcMain.handle("desktop:startup", () => app.getLoginItemSettings({ path: process.execPath, args: ["--background"] }).openAtLogin);
  ipcMain.handle("desktop:set-startup", (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args: ["--background"] });
    desktopSettings.update({ startupPreference: Boolean(enabled), startupSetupVersion: 1 });
    return app.getLoginItemSettings({ path: process.execPath, args: ["--background"] }).openAtLogin;
  });
  ipcMain.handle("desktop:open-support", () => shell.openExternal(WEB_APP_ORIGIN + "/contact"));
  ipcMain.handle("desktop:quit", () => { appIsQuitting = true; app.quit(); });
}

async function createMainWindow() {
  const iconPath = resourcePath("icon.png");
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    title: "PDFRoot Desktop Pro",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => { if (!process.argv.includes("--background")) mainWindow.show(); });
  mainWindow.on("close", (event) => {
    if (!appIsQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => {
    refreshHostedBrand(mainWindow);
    notifyLocalUpdate();
  });

  await mainWindow.loadFile(localUiPath(currentLicenseStatus().ok ? "catalog.html" : "activation.html"));
}

function readLaunchTool(commandLine) {
  const argument = commandLine.find((item) => item.startsWith("--tool="));
  return argument ? argument.slice("--tool=".length) : null;
}

function readLaunchFiles(commandLine) {
  const explicitPaths = commandLine
    .filter((argument) => argument.startsWith("--file="))
    .map((argument) => argument.slice("--file=".length));
  return explicitPaths.filter((filePath) => fs.existsSync(filePath));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("browser-window-created", (_event, window) => {
    window.webContents.on("before-input-event", handleWindowShortcut);
  });
  app.on("second-instance", (_event, commandLine) => {
    if (!startupReady) { pendingLaunches.push(commandLine); return; }
    const requestedContextTool = readContextTool(commandLine);
    if (requestedContextTool) {
      void runContextTool(requestedContextTool, readLaunchFiles(commandLine)).catch(error => {
        console.error("PDFRoot context launch:", error.message);
        void dialog.showMessageBox({ type: "error", message: "PDFRoot could not open this tool.", detail: error.message });
      });
      return;
    }
    const requestedTool = readLaunchTool(commandLine);
    if (requestedTool) openTool(requestedTool, readLaunchFiles(commandLine));
    else showCatalog();
  });

  app.whenReady().then(async () => {
    deviceId = createDeviceIdentity(app.getPath("userData"));
    licenseStore = new LicenseStore({
      userDataPath: app.getPath("userData"),
      publicKeyPath: resourcePath("license-public-key.pem"),
      deviceHash: deviceId,
    });
    let paymentBaseUrl = "";
    try { paymentBaseUrl = paymentApiUrl(resourcePath("payment-api.json")); }
    catch (error) { console.error("Payment URL configuration:", error.message); }
    accountClient = new AccountClient({ baseUrl: paymentBaseUrl, userDataPath: app.getPath("userData"), deviceId, licenseStore });
    paymentClient = new PaymentClient({ baseUrl: paymentBaseUrl, userDataPath: app.getPath("userData"), deviceId, licenseStore, accountClient });
    const userDataPath = app.getPath("userData");
    const hasSavedProfile = fs.existsSync(path.join(userDataPath, "desktop-settings.json")) || fs.existsSync(path.join(userDataPath, "license.json"));
    desktopSettings = new DesktopSettings({ userDataPath });
    if (app.isPackaged && process.platform === "win32") {
      try { configureAutomaticStartup({ settings: desktopSettings, hasSavedProfile,
        getLogin: () => ({ openAtLogin: app.getLoginItemSettings().executableWillLaunchAtLogin || app.getLoginItemSettings().openAtLogin }), setLogin: options => app.setLoginItemSettings(options), executable: process.execPath }); }
      catch (error) { console.error("PDFRoot startup setup:", error.message); }
      // Restore our own per-user menu automatically; never require elevation.
      void repairContextMenu({ executable: process.execPath, resourcesPath: process.resourcesPath })
        .catch(error => console.error("PDFRoot menu setup:", error.message));
    }
    void startExplorerSelectionService();
    const requestedContextTool = readContextTool(process.argv);
    const launchFiles = readLaunchFiles(process.argv);
    // Capture the invoking Explorer selection before the app window steals focus.
    const capturedLaunchFiles = requestedContextTool && requestedContextTool !== "catalog"
      ? await getFocusedExplorerSelection({ anchor: launchFiles[0] }) : undefined;
    findDesktopToolsPython().catch(() => {});
    setupAdFreeDesktopSession();
    setupAutomaticDownloadHandler();
    setupAutoUpdater();
    setupIpc();
    createTray();
    prepareLocalRenderer().catch(() => {
      // PDF-to-JPG can still use the hidden online conversion engine if the
      // Chromium local renderer is unavailable on a particular Windows build.
    });
    registerShortcuts();
    retryUnavailableShortcuts();
    powerMonitor.on("resume", () => { registerShortcuts(); void startExplorerSelectionService(); });
    powerMonitor.on("unlock-screen", () => { registerShortcuts(); void startExplorerSelectionService(); });
    await createMainWindow();
    startupReady = true;
    for (const commandLine of pendingLaunches.splice(0)) {
      const contextTool = readContextTool(commandLine);
      if (contextTool) void runContextTool(contextTool, readLaunchFiles(commandLine)).catch(error => console.error("PDFRoot queued launch:", error.message));
    }
    checkForDesktopUpdate().catch(() => {});
    updateTimer = setInterval(() => { checkForDesktopUpdate().catch(() => {}); }, UPDATE_INTERVAL_MS);
    updateInstallTimer = setInterval(tryInstallDownloadedUpdate, 10000);
    paymentPollTimer = setInterval(() => { checkPendingPayment().catch(() => {}); }, 5000);
    licenseSweepTimer = setInterval(() => {
      if (!currentLicenseStatus().ok && mainWindow && !mainWindow.isDestroyed() &&
          !mainWindow.webContents.getURL().endsWith("/activation.html")) showActivation();
    }, 15000);
    if (requestedContextTool) await runContextTool(requestedContextTool, launchFiles, capturedLaunchFiles);
    else {
      const requestedTool = readLaunchTool(process.argv);
      if (requestedTool) await openTool(requestedTool, readLaunchFiles(process.argv));
    }

    app.on("activate", () => showCatalog());
  }).catch(error => {
    console.error("PDFRoot startup:", error.message);
    void dialog.showMessageBox({ type: "error", title: "PDFRoot Desktop Pro", message: "PDFRoot could not start.", detail: error.message });
  });

  app.on("will-quit", () => {
    if (activeAutoJob) clearTimeout(activeAutoJob.timeout);
    clearInterval(shortcutRetryTimer);
    clearInterval(paymentPollTimer);
    clearInterval(licenseSweepTimer);
    clearInterval(updateTimer);
    clearInterval(updateInstallTimer);
    globalShortcut.unregisterAll();
    stopExplorerSelectionService();
  });
  app.on("window-all-closed", (event) => event.preventDefault());
}

