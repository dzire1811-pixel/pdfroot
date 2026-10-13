const fs = require("node:fs");
const path = require("node:path");
if (!process.argv[2]) throw new Error("Supply source main.cjs to patch.");
const filePath = path.resolve(process.argv[2]);
let source = fs.readFileSync(filePath, "utf8");
const crlf = source.includes("\r\n");
source = source.replace(/\r\n/g, "\n");
function replaceOnce(previous, next, label) {
  const parts = source.split(previous);
  if (parts.length !== 2) throw new Error(`Unexpected ${label} code; refusing unsafe automatic edit (matches: ${parts.length - 1}).`);
  source = parts.join(next);
}

// No keyboard shortcut is allowed to open Windows Open File dialog implicitly.
// Global hotkey -> verify the user's actual Explorer selection -> open selected
// tool. If selection is absent, leave the keyboard focus untouched.
replaceOnce(
  '  if (!selectedFiles.length) selectedFiles = await chooseToolFiles(shortcut.slug);',
  `  if (!selectedFiles.length) {
    const message = "No selected file found. Select the required file(s) in File Explorer and press " + display + " again. PDFRoot will not open a file picker automatically.";
    notify("PDFRoot shortcut", message);
    publishShortcutActivity(shortcut, accelerator, "needs-files", message);
    return false;
  }`,
  "keyboard shortcut fallback"
);

// Context menu receives --file directly from Explorer, and may supplement it
// with multi-file selection. Missing files should not trigger a second dialog.
replaceOnce(
  '  if (!selectedFiles.length) selectedFiles = await chooseToolFiles(slug);\n  if (!selectedFiles.length) return false;',
  `  if (!selectedFiles.length) {
    notify("PDFRoot Desktop Pro", "No selected files detected. Select the required file(s) in Explorer before choosing " + tool.name + ".");
    return false;
  }`,
  "right-click file-picker fallback"
);
replaceOnce(
  `    await dialog.showMessageBox({ type: "info", title: tool.name,
      message: \`\${tool.name} needs \${expectedType} files.\`, detail: "Choose the required files to continue.", buttons: ["Choose files", "Cancel"] })
      .then(async result => { selectedFiles = result.response === 0 ? await chooseToolFiles(slug) : []; });
    if (!selectedFiles.length || !contextToolAcceptsFiles(slug, selectedFiles)) return false;`,
  `    notify("PDFRoot Desktop Pro", tool.name + " requires " + expectedType + " files. Select valid files in File Explorer and try again.");
    return false;`,
  "wrong file-type modal chooser"
);
if (source.slice(source.indexOf("async function runShortcut("), source.indexOf("function dispatchAutoShortcut(")).includes("chooseToolFiles(")) throw Error("Keyboard shortcut still invokes the file picker.");
if (source.slice(source.indexOf("async function runContextTool("), source.indexOf("async function drainAutoShortcutQueue(")).includes("chooseToolFiles(")) throw Error("Context shortcut still invokes the file picker.");
fs.writeFileSync(filePath, crlf ? source.replace(/\n/g, "\r\n") : source);
