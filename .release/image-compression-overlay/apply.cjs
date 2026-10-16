const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(process.argv[2]);
function edit(file, before, after) {
  const name = path.join(app, file), text = fs.readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
  if (!text.includes(before)) throw new Error(`Image overlay anchor missing: ${file}: ${before.slice(0, 65)}`);
  fs.writeFileSync(name, text.replace(before, after));
}
fs.cpSync(path.join(__dirname, 'app'), app, { recursive: true });
edit('src/local-auto.cjs', 'const fs = require("node:fs");', 'const fs = require("node:fs");\nconst { compressImageFiles } = require("./image-compression.cjs");');
edit('src/local-auto.cjs', 'case "compress-image":\n      outputPaths = await compressImages(files, outputDirectory);', 'case "compress-image":\n      ({ outputPaths, warnings } = await compressImageFiles(files, outputDirectory, compressionLevel));');
edit('src/main.cjs', 'function choosePdfCompressionLevel(fileCount) {', 'function choosePdfCompressionLevel(fileCount, slug = "compress-pdf") {');
edit('src/main.cjs', 'title: "PDFRoot — Compress PDF",', 'title: slug === "compress-image" ? "PDFRoot — Compress Image" : "PDFRoot — Compress PDF",');
edit('src/main.cjs', 'height: 346,', 'height: slug === "compress-image" ? 435 : 346,');
edit('src/main.cjs', 'query: { files: String(Math.max(1, Number(fileCount) || 1)) },', 'query: { files: String(Math.max(1, Number(fileCount) || 1)), kind: slug === "compress-image" ? "image" : "pdf" },');
edit('src/main.cjs', 'async function startCompressionShortcut(selectedFiles, shortcut, accelerator) {', 'async function startCompressionShortcut(selectedFiles, shortcut, accelerator) {\n  const slug = shortcut?.slug === "compress-image" ? "compress-image" : "compress-pdf";');
edit('src/main.cjs', 'validateAutomaticSelection("compress-pdf", selectedFiles)', 'validateAutomaticSelection(slug, selectedFiles)');
edit('src/main.cjs', 'choosePdfCompressionLevel(selection.files.length)', 'choosePdfCompressionLevel(selection.files.length, slug)');
edit('src/main.cjs', '"PDF compression level was not selected."', '"Compression level was not selected."');
edit('src/main.cjs', 'return startAutomaticTool("compress-pdf", selection.files, shortcut, accelerator, { compressionLevel });', 'return startAutomaticTool(slug, selection.files, shortcut, accelerator, { compressionLevel });');
edit('src/main.cjs', 'compressionLevel: slug === "compress-pdf" &&', 'compressionLevel: ["compress-pdf", "compress-image"].includes(slug) &&');
edit('src/main.cjs', 'const compressionNote = slug === "compress-pdf"', 'const compressionNote = ["compress-pdf", "compress-image"].includes(slug)');
edit('src/main.cjs', 'if (shortcut.slug === "compress-pdf") return startCompressionShortcut(files, shortcut, accelerator);', 'if (["compress-pdf", "compress-image"].includes(shortcut.slug)) return startCompressionShortcut(files, shortcut, accelerator);');
edit('src/automatic-mode.test.cjs', 'choosePdfCompressionLevel\\(selection\\.files\\.length\\)', 'choosePdfCompressionLevel\\(selection\\.files\\.length, slug\\)');
edit('src/main.cjs', "if (slug === 'resize-pdf-to-exact-kb') return startExactPdfTool(selectedFiles);", `if (slug === 'resize-pdf-to-exact-kb') return startExactPdfTool(selectedFiles);
  if (slug === 'compress-image') {
    const files = selectedFiles.length ? selectedFiles : await chooseToolFiles(slug);
    if (!files.length) return false;
    return startCompressionShortcut(files, { slug, label: 'Compress Image' }, 'Tool catalog');
  }`);
for (const file of ['package.json', 'package-lock.json']) {
  const name = path.join(app, file);
  fs.writeFileSync(name, fs.readFileSync(name, 'utf8').replaceAll('0.7.0-beta.18', '0.7.0-beta.19'));
}
console.log('Image compression presets and Beta 19 applied.');
