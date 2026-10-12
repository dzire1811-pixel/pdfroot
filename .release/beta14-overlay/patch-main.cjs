const fs = require("node:fs");
const path = require("node:path");
if (!process.argv[2]) throw new Error("Provide the path of src/main.cjs");
const mainPath = path.resolve(process.argv[2]);
let source = fs.readFileSync(mainPath, "utf8");
const oldBlock = [
  '      const filename = path.basename(result.outputPath || item.filePath);',
  '      if (result.outputPath) item.filePath = result.outputPath;',
].join("\n");
const newBlock = [
  '      const originalFilename = path.basename(item.filePath);',
  '      const filename = path.basename(result.outputPath || item.filePath);',
  '      if (result.outputPath) item.filePath = result.outputPath;',
].join("\n");
const oldMessage = '      const message = `${filename} saved in its original folder (${result.width} × ${result.height}, ${sizeLabel}).`;';
const newMessage = [
  '      const message = result.originalUnchanged',
  '        ? `${filename} saved as a separate copy (${result.width} × ${result.height}, ${sizeLabel}). Windows prevented replacing ${originalFilename}; the original is unchanged. Close Photos or File Explorer Preview Pane before trying Save & Replace again.`',
  '        : `${filename} saved in its original folder (${result.width} × ${result.height}, ${sizeLabel}).`;'
].join("\n");
if (source.split(oldBlock).length !== 2 || source.split(oldMessage).length !== 2) {
  throw new Error("Crop save code has changed; refusing to patch a different version of main.cjs");
}
source = source.replace(oldBlock, newBlock).replace(oldMessage, newMessage);
fs.writeFileSync(mainPath, source);
