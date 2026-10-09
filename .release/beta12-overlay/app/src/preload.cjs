const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pdfrootDesktop", {
  updateStatus: () => ipcRenderer.invoke("desktop:update-status"),
  checkUpdate: () => ipcRenderer.invoke("desktop:check-update"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("desktop:update-status", listener);
    return () => ipcRenderer.removeListener("desktop:update-status", listener);
  },
  licenseStatus: () => ipcRenderer.invoke("desktop:license-status"),
  activate: (code) => ipcRenderer.invoke("desktop:activate", code),
  paymentAvailable: () => ipcRenderer.invoke("desktop:payment-available"),
  accountStatus: () => ipcRenderer.invoke("desktop:account-status"),
  accountSummary: () => ipcRenderer.invoke("desktop:account-summary"),
  sendLoginCode: (email) => ipcRenderer.invoke("desktop:send-login-code", email),
  verifyLoginCode: (email, code) => ipcRenderer.invoke("desktop:verify-login-code", email, code),
  googleSignIn: (plan) => ipcRenderer.invoke("desktop:google-sign-in", plan),
  startTrial: () => ipcRenderer.invoke("desktop:start-trial"),
  startPayment: (name) => ipcRenderer.invoke("desktop:start-payment", name),
  checkPayment: () => ipcRenderer.invoke("desktop:check-payment"),
  copyDeviceId: () => ipcRenderer.invoke("desktop:copy-device-id"),
  openCatalog: () => ipcRenderer.invoke("desktop:open-catalog"),
  openTool: (slug) => ipcRenderer.invoke("desktop:open-tool", slug),
  tools: () => ipcRenderer.invoke("desktop:tools"),
  takePendingFiles: () => ipcRenderer.invoke("desktop:pending-files"),
  pendingFileSummary: () => ipcRenderer.invoke("desktop:pending-file-summary"),
  reportAutoStatus: (status) => ipcRenderer.send("desktop:auto-status", status),
  choosePdfCompression: (level) => ipcRenderer.send("desktop:choose-pdf-compression", level),
  chooseImageSetting: (choice) => ipcRenderer.send("desktop:choose-image-setting", choice),
  frontBackPreviews: () => ipcRenderer.invoke("desktop:front-back-previews"),
  chooseFrontBackOrder: (order) => ipcRenderer.send("desktop:choose-front-back-order", order),
  pageOrderPreviews: () => ipcRenderer.invoke("desktop:page-order-previews"),
  choosePageOrder: (order) => ipcRenderer.send("desktop:choose-page-order", order),
  cropItems: () => ipcRenderer.invoke("desktop:crop-items"),
  cropSource: (id) => ipcRenderer.invoke("desktop:crop-source", id),
  addCropImages: () => ipcRenderer.invoke("desktop:crop-add-images"),
  copyCropImage: (id) => ipcRenderer.invoke("desktop:crop-copy-image", id),
  saveCrop: (payload) => ipcRenderer.invoke("desktop:crop-save", payload),
  closeCrop: () => ipcRenderer.send("desktop:crop-close"),
  onCropItemsReplaced: (callback) => {
    const listener = (_event, items) => callback(items);
    ipcRenderer.on("desktop:crop-replace-items", listener);
    return () => ipcRenderer.removeListener("desktop:crop-replace-items", listener);
  },
  shortcuts: () => ipcRenderer.invoke("desktop:shortcuts"),
  shortcutActivity: () => ipcRenderer.invoke("desktop:shortcut-activity"),
  refreshShortcuts: () => ipcRenderer.invoke("desktop:refresh-shortcuts"),
  onShortcutsUpdated: (callback) => {
    const listener = (_event, shortcuts) => callback(shortcuts);
    ipcRenderer.on("desktop:shortcuts-updated", listener);
    return () => ipcRenderer.removeListener("desktop:shortcuts-updated", listener);
  },
  onShortcutActivity: (callback) => {
    const listener = (_event, activity) => callback(activity);
    ipcRenderer.on("desktop:shortcut-activity", listener);
    return () => ipcRenderer.removeListener("desktop:shortcut-activity", listener);
  },
  processingMode: () => ipcRenderer.invoke("desktop:processing-mode"),
  setProcessingMode: (mode) => ipcRenderer.invoke("desktop:set-processing-mode", mode),
  toggleProcessingMode: () => ipcRenderer.invoke("desktop:toggle-processing-mode"),
  startup: () => ipcRenderer.invoke("desktop:startup"),
  setStartup: (enabled) => ipcRenderer.invoke("desktop:set-startup", enabled),
  openSupport: () => ipcRenderer.invoke("desktop:open-support"),
  quit: () => ipcRenderer.invoke("desktop:quit"),
});
