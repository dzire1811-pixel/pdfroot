const fs = require("node:fs");
if (!process.argv[2]) throw new Error("Provide src/local-auto.test.cjs");
const filePath = process.argv[2];
let source = fs.readFileSync(filePath, "utf8");
const crlf = source.includes("\r\n");
source = source.replace(/\r\n/g, "\n");
// The old card test assumed that an image smaller than its companion is
// *upscaled* and left-aligned. That was precisely the blur to eliminate.
const oldSize = '    frontSource.resize({ w: targetWidth });\n    backSource.resize({ w: targetWidth });';
const newSize = '    if (frontSource.width > targetWidth) frontSource.resize({ w: targetWidth });\n    if (backSource.width > targetWidth) backSource.resize({ w: targetWidth });';
const count=source.split(oldSize).length-1;
if (count !== 2) throw new Error("Unexpected Front/Back assertions; refused modifying baseline tests ("+count+")");
source = source.split(oldSize).join(newSize);
const oldX = '    const imageX = outerMargin + border + padding + 20;';
const newX = '    const imageX = outerMargin + border + padding + Math.floor(targetWidth / 2);';
if (source.split(oldX).length!==2) throw new Error("Could not find old sampled card pixel");
source = source.replace(oldX,newX);
fs.writeFileSync(filePath, crlf ? source.replace(/\n/g, "\r\n") : source);
