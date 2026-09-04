import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
} from "pdf-lib";
import { repairIndicText, validateGujaratiText } from "./unicode";

type PdfGlyph = { originalCharCode?: number; unicode?: string; width?: number };
type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type Ops = { setFont: number; showText: number };
type GlyphRecord = { original: string; corrected: string; zeroWidthBase: boolean };

export type PageGlyphStreams = Map<string, GlyphRecord[]>;

function uint16(data: Uint8Array, offset: number) {
  return (data[offset] << 8) | data[offset + 1];
}

function uint32(data: Uint8Array, offset: number) {
  return (data[offset] * 0x1000000) + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
}

function tag(data: Uint8Array, offset: number) {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function cmapTableOffset(data: Uint8Array) {
  const count = uint16(data, 4);
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    if (tag(data, record) === "cmap") return uint32(data, record + 8);
  }
  return -1;
}

function usefulUnicode(codePoint: number) {
  return codePoint === 0x20
    || codePoint >= 0x21 && codePoint <= 0x7e
    || codePoint >= 0x0900 && codePoint <= 0x097f
    || codePoint >= 0x0a80 && codePoint <= 0x0aff;
}

function parseFormat4(data: Uint8Array, offset: number, gidToUnicode: Map<number, string>) {
  const segCount = uint16(data, offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  for (let segment = 0; segment < segCount; segment += 1) {
    const start = uint16(data, startCodes + segment * 2);
    const end = uint16(data, endCodes + segment * 2);
    const delta = uint16(data, idDeltas + segment * 2);
    const rangeOffset = uint16(data, idRangeOffsets + segment * 2);
    for (let codePoint = start; codePoint <= end && codePoint !== 0xffff; codePoint += 1) {
      if (!usefulUnicode(codePoint)) continue;
      let glyph = 0;
      if (!rangeOffset) glyph = (codePoint + delta) & 0xffff;
      else {
        const glyphOffset = idRangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2;
        if (glyphOffset + 1 >= data.length) continue;
        glyph = uint16(data, glyphOffset);
        if (glyph) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph && !gidToUnicode.has(glyph)) gidToUnicode.set(glyph, String.fromCodePoint(codePoint));
    }
  }
}

function parseFormat12(data: Uint8Array, offset: number, gidToUnicode: Map<number, string>) {
  const groups = uint32(data, offset + 12);
  for (let index = 0; index < groups; index += 1) {
    const group = offset + 16 + index * 12;
    const start = uint32(data, group);
    const end = uint32(data, group + 4);
    const startGlyph = uint32(data, group + 8);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      if (!usefulUnicode(codePoint)) continue;
      const glyph = startGlyph + codePoint - start;
      if (glyph && !gidToUnicode.has(glyph)) gidToUnicode.set(glyph, String.fromCodePoint(codePoint));
    }
  }
}

/** Reverses the embedded TrueType cmap so a PDF CID/GID can be checked against ToUnicode. */
function embeddedGlyphUnicode(data: Uint8Array) {
  const cmap = cmapTableOffset(data);
  const result = new Map<number, string>();
  if (cmap < 0 || cmap + 4 >= data.length) return result;
  const tables = uint16(data, cmap + 2);
  const candidates: Array<{ priority: number; offset: number; format: number }> = [];
  for (let index = 0; index < tables; index += 1) {
    const record = cmap + 4 + index * 8;
    const platform = uint16(data, record);
    const encoding = uint16(data, record + 2);
    const offset = cmap + uint32(data, record + 4);
    if (offset + 2 > data.length) continue;
    const format = uint16(data, offset);
    if (format !== 4 && format !== 12) continue;
    const priority = platform === 3 && encoding === 10 ? 0 : platform === 3 && encoding === 1 ? 1 : platform === 0 ? 2 : 3;
    candidates.push({ priority, offset, format });
  }
  candidates.sort((left, right) => left.priority - right.priority);
  for (const candidate of candidates) {
    if (candidate.format === 12) parseFormat12(data, candidate.offset, result);
    else parseFormat4(data, candidate.offset, result);
  }
  return result;
}

function streamBytes(stream: PDFStream) {
  return stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
}

function descendantFont(font: PDFDict, document: PDFDocument) {
  const descendants = document.context.lookup(font.get(PDFName.of("DescendantFonts"))!) as PDFArray | undefined;
  return descendants?.size() ? document.context.lookup(descendants.get(0)) as PDFDict : undefined;
}

function fontFile(font: PDFDict, document: PDFDocument) {
  const descendant = descendantFont(font, document);
  const descriptorValue = descendant?.get(PDFName.of("FontDescriptor")) ?? font.get(PDFName.of("FontDescriptor"));
  if (!descriptorValue) return undefined;
  const descriptor = document.context.lookup(descriptorValue) as PDFDict;
  for (const key of ["FontFile2", "FontFile3", "FontFile"]) {
    const value = descriptor.get(PDFName.of(key));
    if (value) return document.context.lookup(value) as PDFStream;
  }
  return undefined;
}

function cidToGid(font: PDFDict, document: PDFDocument, cid: number) {
  const mapping = descendantFont(font, document)?.get(PDFName.of("CIDToGIDMap"));
  if (!mapping || mapping === PDFName.of("Identity") || mapping.toString() === "/Identity") return cid;
  const stream = document.context.lookup(mapping) as PDFStream;
  const bytes = streamBytes(stream);
  const offset = cid * 2;
  return offset + 1 < bytes.length ? uint16(bytes, offset) : cid;
}

function resourceName(fontId: string) {
  const match = /_f(\d+)$/i.exec(fontId);
  return match ? `F${match[1]}` : fontId.replace(/^\//, "");
}

function pageGlyphStreams(
  document: PDFDocument,
  pageIndex: number,
  operatorList: OperatorList,
  ops: Ops,
): PageGlyphStreams {
  const page = document.getPages()[pageIndex];
  const resources = page?.node.Resources();
  const fontDictionary = resources?.get(PDFName.of("Font"));
  if (!fontDictionary) return new Map();
  const fonts = document.context.lookup(fontDictionary) as PDFDict;
  const glyphMaps = new Map<string, { font: PDFDict; glyphs: Map<number, string> }>();
  for (const [name, value] of fonts.entries()) {
    const font = document.context.lookup(value) as PDFDict;
    const file = fontFile(font, document);
    if (!file) continue;
    const glyphs = embeddedGlyphUnicode(streamBytes(file));
    if (glyphs.size) glyphMaps.set(name.decodeText(), { font, glyphs });
  }

  const streams: PageGlyphStreams = new Map();
  let activeFont = "";
  operatorList.fnArray.forEach((operation, index) => {
    if (operation === ops.setFont) {
      activeFont = String(operatorList.argsArray[index]?.[0] ?? "");
      return;
    }
    if (operation !== ops.showText || !activeFont) return;
    const resource = resourceName(activeFont);
    const embedded = glyphMaps.get(resource);
    const records = streams.get(activeFont) ?? [];
    const glyphs = (operatorList.argsArray[index]?.[0] as Array<PdfGlyph | number> | undefined) ?? [];
    for (const glyph of glyphs) {
      if (typeof glyph === "number" || !glyph.unicode) continue;
      const cid = glyph.originalCharCode;
      const gid = cid === undefined || !embedded ? undefined : cidToGid(embedded.font, document, cid);
      const corrected = gid === undefined || !embedded ? undefined : embedded.glyphs.get(gid);
      const mapped = corrected ?? glyph.unicode;
      records.push({
        original: glyph.unicode,
        corrected: mapped,
        // A zero-advance glyph mapped to a base letter is structurally
        // suspicious: base letters advance, while marks/ligature components
        // may not. This detects damaged shaped-font CMaps without assuming a
        // particular word, character substitution, filename, or font family.
        zeroWidthBase: glyph.width === 0 && /[\p{Letter}\p{Number}]/u.test(mapped),
      });
    }
    streams.set(activeFont, records);
  });
  for (const [fontName, records] of streams) {
    const brokenWhitespace = records.filter((record) => /^\s+$/u.test(record.original) && /[\u0900-\u097F\u0A80-\u0AFF]/u.test(record.corrected)).length;
    const recoveredInvalid = records.filter((record) => /[\uFFFD\uE000-\uF8FF]/u.test(record.original)
      && !/[\uFFFD\uE000-\uF8FF]/u.test(record.corrected)).length;
    if (!(brokenWhitespace || recoveredInvalid)) {
      streams.set(fontName, records.map((record) => ({ ...record, corrected: record.original })));
    }
  }
  return streams;
}

export async function createPdfGlyphUnicodeResolver(pdfBytes: Uint8Array) {
  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  return {
    pageStreams(pageIndex: number, operatorList: OperatorList, ops: Ops) {
      return pageGlyphStreams(document, pageIndex, operatorList, ops);
    },
  };
}

function visualToLogicalIndic(text: string) {
  return text
    .replace(/\u0ABF([\u0A95-\u0AB9](?:\u0ACD[\u0A95-\u0AB9])*)/gu, "$1\u0ABF")
    .replace(/([\u0A95-\u0AB9][\u0ABC-\u0ACC]*)\u0AB0\u0ACD/gu, "\u0AB0\u0ACD$1")
    .replace(/\u093F([\u0915-\u0939](?:\u094D[\u0915-\u0939])*)/gu, "$1\u093F");
}

function matchGlyphs(records: GlyphRecord[], start: number, target: string) {
  const compactTarget = target.replace(/\s+/gu, "");
  for (let candidate = start; candidate < Math.min(records.length, start + 768); candidate += 1) {
    if (!records[candidate].original.replace(/\s+/gu, "")) continue;
    let original = "";
    for (let end = candidate; end < Math.min(records.length, candidate + 160); end += 1) {
      original += records[end].original;
      const compactOriginal = original.replace(/\s+/gu, "");
      if (compactOriginal === compactTarget) return { start: candidate, end: end + 1 };
      if (compactOriginal && !compactTarget.startsWith(compactOriginal)) break;
    }
  }
  return undefined;
}

/** Applies cmap corrections to PDF.js TextItems while retaining PDF.js geometry and item grouping. */
export function correctTextItemsFromGlyphStreams<T extends { str: string; fontName: string }>(items: T[], streams: PageGlyphStreams) {
  const cursors = new Map<string, number>();
  const unreliableFonts = new Set(items
    .filter((item) => validateGujaratiText(item.str).length > 0)
    .map((item) => item.fontName));
  const structurallyUnsafeFonts = new Set([...streams]
    .filter(([, records]) => records.some((record) => record.zeroWidthBase))
    .map(([fontName]) => fontName));
  return items.map((item) => {
    const records = streams.get(item.fontName);
    if (!records?.length || !item.str.trim()) return item;
    if (structurallyUnsafeFonts.has(item.fontName)) return { ...item, unicodeReliable: false };
    if (!unreliableFonts.has(item.fontName)) return { ...item, str: repairIndicText(item.str) };
    const leading = item.str.match(/^\s*/u)?.[0] ?? "";
    const trailing = item.str.match(/\s*$/u)?.[0] ?? "";
    const target = item.str.slice(leading.length, item.str.length - trailing.length || undefined);
    if (!target) return item;
    const match = matchGlyphs(records, cursors.get(item.fontName) ?? 0, target);
    if (!match) return { ...item, str: repairIndicText(item.str) };
    let correctedEnd = match.end;
    while (correctedEnd < records.length
      && /^\s+$/u.test(records[correctedEnd].original)
      && /[\u0900-\u097F\u0A80-\u0AFF]/u.test(records[correctedEnd].corrected)) correctedEnd += 1;
    cursors.set(item.fontName, correctedEnd);
    const corrected = records.slice(match.start, correctedEnd).map((record) => record.corrected).join("");
    return { ...item, str: `${leading}${repairIndicText(visualToLogicalIndic(corrected))}${trailing}` };
  });
}
