const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { contextMenuTools } = require("./context-menu.cjs");

function registryText(value) { return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
function contextRegistry(executable, resourcesPath) {
  const root = "HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\PDFRootDesktopPro";
  const installerKeys = {"resize-pdf-to-exact-kb":"03ExactKbPdf","merge-pdf":"01MergePdf","split-pdf":"02SplitPdf","compress-pdf":"03CompressPdf","pdf-to-word":"04PdfToWord","pdf-to-excel":"05PdfToExcel","pdf-to-powerpoint":"06PdfToPowerPoint","pdf-to-jpg":"07PdfToJpg","rotate-pdf":"08RotatePdf","organize-pdf-pages":"09OrganizePdf","delete-pdf-pages":"10DeletePdfPages","watermark-pdf":"11WatermarkPdf","crop-pdf":"12CropPdf","protect-pdf":"13ProtectPdf","unlock-pdf":"14UnlockPdf","edit-pdf":"15EditPdf","jpg-to-pdf":"01JpgToPdf","png-to-pdf":"02PngToPdf","resize-image-to-exact-kb":"03ExactKb","compress-image":"04CompressImage","crop-image":"05CropImage","resize-image":"06ResizeImage","jpg-to-png":"07JpgToPng","png-to-jpg":"08PngToJpg","signature-resize-tool":"09SignatureResize","image-compressor-for-government-forms":"10GovtCompressor","ssc-photo-resize":"11SscResize","rrb-signature-resize":"12RrbResize","ibps-photo-resize":"13IbpsResize","ojas-photo-resize":"14OjasResize","gpsc-photo-resize":"15GpscResize","upsc-photo-resize":"16UpscResize","front-back-card-merge":"17FrontBack"};
  const lines = ["Windows Registry Editor Version 5.00", "", `[${root}]`,
    '"MUIVerb"="PDFRoot Desktop Pro"', '"SubCommands"=""', '"Position"="Top"', '"MultiSelectModel"="Player"',
    '"Icon"=' + registryText(path.join(resourcesPath, "context-icons", "pdfroot-menu.ico")),
    '"AppliesTo"=' + registryText(['pdf','jpg','jpeg','png','webp','bmp','tif','tiff'].map(ext => `System.FileExtension:=".${ext}"`).join(" OR "))];
  for (const tool of contextMenuTools.filter(item => item.slug !== "catalog")) {
    const key = root + "\\shell\\" + installerKeys[tool.slug];
    lines.push("", `[${key}]`, '"MUIVerb"=' + registryText(tool.label),
      '"Icon"=' + registryText(path.join(resourcesPath, "context-icons", tool.slug + ".ico")),
      '"AppliesTo"=' + registryText(tool.group === "pdf" ? 'System.FileExtension:=".pdf"'
        : ['jpg','jpeg','png','webp','bmp','tif','tiff'].map(ext => `System.FileExtension:=".${ext}"`).join(" OR ")),
      `[${key}\\command]`, '@=' + registryText(`"${executable}" --context-tool=${tool.slug} --file="%1"`));
  }
  for (const location of ["Directory", "Directory\\Background"]) {
    const key = `HKEY_CURRENT_USER\\Software\\Classes\\${location}\\shell\\PDFRootDesktopPro`;
    lines.push("", `[${key}]`, '"MUIVerb"="Open PDFRoot Desktop Pro"', '"Position"="Top"',
      '"Icon"=' + registryText(path.join(resourcesPath, "context-icons", "pdfroot-menu.ico")),
      `[${key}\\command]`, '@=' + registryText(`"${executable}" --context-tool=catalog`));
  }
  return lines.join("\r\n") + "\r\n";
}
async function repairContextMenu({ executable, resourcesPath, platform = process.platform,
  run = promisify(execFile) }) {
  if (platform !== "win32") return false;
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pdfroot-menu-"));
  const file = path.join(directory, "menu.reg");
  try {
    await fs.promises.writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(contextRegistry(executable, resourcesPath), "utf16le")]));
    await run("reg.exe", ["import", file], { windowsHide: true, timeout: 10_000 });
    return true;
  } finally { await fs.promises.rm(directory, { recursive: true, force: true }); }
}
function startupLoginOptions(executable) {
  // Electron 39 parses this lookup as a command line. Quote paths containing
  // spaces (including the product's .exe name) before querying launch items.
  return { path: '"' + executable + '"', args: ['--background'] };
}
function automaticStartupEnabled(login, executable) {
  if (!Array.isArray(login.launchItems)) return Boolean(login.openAtLogin);
  const normalize = value => String(value || '').replace(/^"|"$/g, '').replace(/\\/g, '/').toLowerCase();
  return login.launchItems.some(item => item.name === 'PDFRoot Desktop Pro' && item.scope === 'user' &&
    item.enabled && normalize(item.path) === normalize(executable) &&
    item.args?.length === 1 && item.args[0] === '--background');
}
function configureAutomaticStartup({ settings, hasSavedProfile, getLogin, setLogin, executable }) {
  const saved = settings.read();
  const login = getLogin();
  const normalizeExe = value => String(value || '').replace(/^"|"$/g, '').replace(/\\/g, '/').toLowerCase();
  // Earlier Electron builds used their default AppUserModelId as the value
  // name. Remove only matching per-user PDFRoot background launch duplicates.
  for (const item of login.launchItems || []) {
    if (item.scope === 'user' && item.name !== 'PDFRoot Desktop Pro' &&
        normalizeExe(item.path) === normalizeExe(executable) &&
        item.args?.length === 1 && item.args[0] === '--background') {
      setLogin({ name: item.name, openAtLogin: false, enabled: false, path: executable, args: ['--background'] });
    }
  }
  // Old migrations treated an absent Run entry as an explicit opt-out. Enable
  // once for those legacy profiles; preserve choices made in this version.
  const enabled = saved.startupSetupVersion >= 2 && typeof saved.startupPreference === "boolean"
    ? saved.startupPreference : true;
  if (automaticStartupEnabled(login, executable) !== enabled || enabled) setLogin({ name: "PDFRoot Desktop Pro", openAtLogin: enabled, enabled, path: executable, args: ["--background"] });
  settings.update({ startupSetupVersion: 2, startupPreference: enabled });
  return enabled;
}
function resolveLaunchSelection(explorerFiles, explicitFiles, exists = fs.existsSync) {
  const valid = files => (Array.isArray(files) ? files : []).filter(file => typeof file === "string" && exists(file));
  const explicit = valid(explicitFiles), explorer = valid(explorerFiles);
  const selected = explicit.length > 1 ? explicit : explicit.length === 1 && !explorer.some(file => file.toLowerCase() === explicit[0].toLowerCase())
    ? explicit : explorer.length ? explorer : explicit;
  return [...new Map(selected.map(file => [file.toLowerCase(), file])).values()];
}
module.exports = { startupLoginOptions, automaticStartupEnabled, contextRegistry, repairContextMenu, configureAutomaticStartup, resolveLaunchSelection };
