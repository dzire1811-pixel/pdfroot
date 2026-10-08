const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { contextMenuTools } = require("./context-menu.cjs");

function registryText(value) { return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
function contextRegistry(executable, resourcesPath) {
  const root = "HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\PDFRootDesktopPro";
  const installerKeys = {"merge-pdf":"01MergePdf","split-pdf":"02SplitPdf","compress-pdf":"03CompressPdf","pdf-to-word":"04PdfToWord","pdf-to-excel":"05PdfToExcel","pdf-to-powerpoint":"06PdfToPowerPoint","pdf-to-jpg":"07PdfToJpg","rotate-pdf":"08RotatePdf","organize-pdf-pages":"09OrganizePdf","delete-pdf-pages":"10DeletePdfPages","watermark-pdf":"11WatermarkPdf","crop-pdf":"12CropPdf","protect-pdf":"13ProtectPdf","unlock-pdf":"14UnlockPdf","edit-pdf":"15EditPdf","jpg-to-pdf":"01JpgToPdf","png-to-pdf":"02PngToPdf","resize-image-to-exact-kb":"03ExactKb","compress-image":"04CompressImage","crop-image":"05CropImage","resize-image":"06ResizeImage","jpg-to-png":"07JpgToPng","png-to-jpg":"08PngToJpg","signature-resize-tool":"09SignatureResize","image-compressor-for-government-forms":"10GovtCompressor","ssc-photo-resize":"11SscResize","rrb-signature-resize":"12RrbResize","ibps-photo-resize":"13IbpsResize","ojas-photo-resize":"14OjasResize","gpsc-photo-resize":"15GpscResize","upsc-photo-resize":"16UpscResize","front-back-card-merge":"17FrontBack"};
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
function configureAutomaticStartup({ settings, hasSavedProfile, getLogin, setLogin, executable }) {
  const saved = settings.read();
  const login = getLogin();
  const enabled = typeof saved.startupPreference === "boolean" ? saved.startupPreference
    : hasSavedProfile ? login.openAtLogin : true;
  if (login.openAtLogin !== enabled || enabled) setLogin({ openAtLogin: enabled, path: executable, args: ["--background"] });
  settings.update({ startupSetupVersion: 1, startupPreference: enabled });
  return enabled;
}
function resolveLaunchSelection(explorerFiles, explicitFiles, exists = fs.existsSync) {
  const valid = files => (Array.isArray(files) ? files : []).filter(file => typeof file === "string" && exists(file));
  const explicit = valid(explicitFiles), explorer = valid(explorerFiles);
  const selected = explicit.length > 1 ? explicit : explicit.length === 1 && !explorer.some(file => file.toLowerCase() === explicit[0].toLowerCase())
    ? explicit : explorer.length ? explorer : explicit;
  return [...new Map(selected.map(file => [file.toLowerCase(), file])).values()];
}
module.exports = { contextRegistry, repairContextMenu, configureAutomaticStartup, resolveLaunchSelection };
