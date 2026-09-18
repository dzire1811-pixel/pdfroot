export type WordTextLanguage = "en-US" | "gu-IN" | "hi-IN" | "ar-SA" | "he-IL" | "zh-CN" | "ja-JP" | "ko-KR";
export type WordScript = "latin" | "devanagari" | "gujarati" | "arabic" | "hebrew" | "han" | "kana" | "hangul" | "common";

const GUJARATI = /[\u0A80-\u0AFF]/u;
const DEVANAGARI = /[\u0900-\u097F\uA8E0-\uA8FF]/u;
const COMBINING_MARK = /\p{Mark}/u;
const GUJARATI_VIRAMA = "\u0ACD";
const DEVANAGARI_VIRAMA = "\u094D";
const MISSING_GLYPH_BOX = /[\u25A0\u25A1\u25AF\u2610]/u;

export function unicodeGraphemeClusters(text: string, locale = "und") {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    return [...segmenter.segment(text)].map(({ segment }) => segment);
  }
  return [...text].reduce<string[]>((clusters, character) => {
    if (COMBINING_MARK.test(character) && clusters.length) clusters[clusters.length - 1] += character;
    else clusters.push(character);
    return clusters;
  }, []);
}

function isSingleGujaratiGrapheme(value: string) {
  return Boolean(value) && GUJARATI.test(value) && unicodeGraphemeClusters(value, "gu").length === 1;
}

function collapseFragmentedGujaratiTokens(text: string) {
  const parts = text.split(/(\s+)/u);
  const output: string[] = [];
  for (let index = 0; index < parts.length;) {
    if (!isSingleGujaratiGrapheme(parts[index])) {
      output.push(parts[index]);
      index += 1;
      continue;
    }
    const start = index;
    const tokens = [parts[index]];
    let cursor = index + 1;
    while (cursor + 1 < parts.length && /^\s+$/u.test(parts[cursor]) && isSingleGujaratiGrapheme(parts[cursor + 1])) {
      tokens.push(parts[cursor + 1]);
      cursor += 2;
    }
    if (tokens.length >= 3) output.push(tokens.join(""));
    else output.push(...parts.slice(start, cursor));
    index = cursor;
  }
  return output.join("");
}

/** Repairs only structurally impossible Indic spacing; it never transliterates text. */
export function repairIndicText(text: string) {
  const repaired = text
    .replace(/([\p{Script=Gujarati}\p{Script=Devanagari}])[ \t]+(?=\p{Mark})/gu, "$1")
    .replace(new RegExp(`([${GUJARATI_VIRAMA}${DEVANAGARI_VIRAMA}])[ \\t]+(?=[\\p{Script=Gujarati}\\p{Script=Devanagari}])`, "gu"), "$1");
  // Single-letter words alone are not evidence of a damaged mapping.
  if (repaired === text) return text;
  return collapseFragmentedGujaratiTokens(repaired).normalize("NFC");
}

export type GujaratiTextIssue = "replacement-character" | "private-use-character" | "missing-glyph-box" | "isolated-combining-mark" | "space-before-combining-mark" | "excessive-single-grapheme-fragments";

export function validateGujaratiText(text: string): GujaratiTextIssue[] {
  if (!GUJARATI.test(text)) return [];
  const issues = new Set<GujaratiTextIssue>();
  if (text.includes("\uFFFD")) issues.add("replacement-character");
  if (MISSING_GLYPH_BOX.test(text)) issues.add("missing-glyph-box");
  if (/\s+\p{Mark}/u.test(text)) issues.add("space-before-combining-mark");
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0xe000 && codePoint <= 0xf8ff
      || codePoint >= 0xf0000 && codePoint <= 0xffffd
      || codePoint >= 0x100000 && codePoint <= 0x10fffd) issues.add("private-use-character");
  }
  if (unicodeGraphemeClusters(text.trim(), "gu").some((cluster, index) => index === 0 && COMBINING_MARK.test(cluster[0]))) {
    issues.add("isolated-combining-mark");
  }
  const tokens = text.trim().split(/\s+/u);
  let singleRun = 0;
  for (const token of tokens) {
    if (isSingleGujaratiGrapheme(token)) {
      singleRun += 1;
      if (singleRun >= 3) issues.add("excessive-single-grapheme-fragments");
    } else singleRun = 0;
  }
  return [...issues];
}

type PositionedGujaratiFragment = {
  text: string;
  x: number;
  top: number;
  baseline: number;
  width: number;
  height: number;
  fontSize: number;
  fontName?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
};

function sameTextStyle(left: PositionedGujaratiFragment, right: PositionedGujaratiFragment) {
  return left.fontName === right.fontName
    && left.fontFamily === right.fontFamily
    && left.bold === right.bold
    && left.italic === right.italic
    && Math.abs(left.fontSize - right.fontSize) <= Math.max(0.5, left.fontSize * 0.05);
}

/** Joins PDF glyph records using geometry while keeping real Gujarati word gaps. */
export function reconstructGujaratiFragments<T extends PositionedGujaratiFragment>(items: T[]): T[] {
  const output: T[] = [];
  for (const source of items) {
    const current = { ...source, text: repairIndicText(source.text) } as T;
    const previous = output.at(-1);
    if (!previous || !(GUJARATI.test(previous.text) || GUJARATI.test(current.text))) {
      output.push(current);
      continue;
    }

    const gap = current.x - (previous.x + previous.width);
    const fontSize = Math.max(previous.fontSize, current.fontSize);
    const wordGap = Math.max(1.2, fontSize * 0.24);
    const maximumJoinGap = Math.max(7, fontSize * 1.45);
    const startsWithMark = COMBINING_MARK.test(current.text.trimStart()[0] ?? "");
    const previousEndsWithVirama = [GUJARATI_VIRAMA, DEVANAGARI_VIRAMA].includes(previous.text.trimEnd().at(-1) ?? "");
    const previousEndsWithMark = COMBINING_MARK.test(previous.text.trimEnd().at(-1) ?? "");
    const clusterMustStayTogether = startsWithMark || previousEndsWithVirama
      || previousEndsWithMark && gap <= Math.max(2, fontSize * 0.3);
    if (gap > maximumJoinGap && !clusterMustStayTogether || !sameTextStyle(previous, current) && !clusterMustStayTogether) {
      output.push(current);
      continue;
    }

    const hasExplicitWhitespace = /\s$/u.test(previous.text) || /^\s/u.test(current.text);
    const separator = !hasExplicitWhitespace && gap > wordGap && !clusterMustStayTogether ? " " : "";
    const right = Math.max(previous.x + previous.width, current.x + current.width);
    output[output.length - 1] = {
      ...previous,
      text: repairIndicText(`${previous.text}${separator}${current.text}`),
      top: Math.min(previous.top, current.top),
      baseline: Math.max(previous.baseline, current.baseline),
      width: right - Math.min(previous.x, current.x),
      height: Math.max(previous.top + previous.height, current.top + current.height) - Math.min(previous.top, current.top),
      x: Math.min(previous.x, current.x),
    } as T;
  }
  return output;
}

export function wordLanguageForText(text: string): WordTextLanguage {
  if (GUJARATI.test(text)) return "gu-IN";
  if (DEVANAGARI.test(text)) return "hi-IN";
  if (/\p{Script=Arabic}/u.test(text)) return "ar-SA";
  if (/\p{Script=Hebrew}/u.test(text)) return "he-IL";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja-JP";
  if (/\p{Script=Hangul}/u.test(text)) return "ko-KR";
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  return "en-US";
}

export function wordScriptForCharacter(character: string): WordScript {
  if (GUJARATI.test(character)) return "gujarati";
  if (DEVANAGARI.test(character)) return "devanagari";
  if (/\p{Script=Arabic}/u.test(character)) return "arabic";
  if (/\p{Script=Hebrew}/u.test(character)) return "hebrew";
  if (/\p{Script=Han}/u.test(character)) return "han";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) return "kana";
  if (/\p{Script=Hangul}/u.test(character)) return "hangul";
  if (/\p{Script=Latin}/u.test(character)) return "latin";
  return "common";
}

export function splitTextByScript(text: string) {
  const segments: Array<{ text: string; script: Exclude<WordScript, "common"> }> = [];
  let pendingCommon = "";
  for (const character of text) {
    const detected = wordScriptForCharacter(character);
    if (detected === "common") {
      if (segments.length) segments[segments.length - 1].text += character;
      else pendingCommon += character;
      continue;
    }
    const previous = segments.at(-1);
    if (previous?.script === detected) previous.text += `${pendingCommon}${character}`;
    else segments.push({ text: `${pendingCommon}${character}`, script: detected });
    pendingCommon = "";
  }
  if (pendingCommon) {
    if (segments.length) segments[segments.length - 1].text += pendingCommon;
    else segments.push({ text: pendingCommon, script: "latin" });
  }
  return segments;
}

const RELIABLE_LATIN_FONTS = new Set([
  "arial", "calibri", "cambria", "courier new", "georgia", "segoe ui",
  "tahoma", "times new roman", "trebuchet ms", "verdana",
]);
const RELIABLE_DEVANAGARI_FONTS = new Set([
  "mangal", "nirmala ui", "noto sans devanagari", "noto serif devanagari",
]);
const RELIABLE_GUJARATI_FONTS = new Set([
  "nirmala ui", "shruti", "noto sans gujarati", "noto serif gujarati",
]);

function reliableForScript(font: string, script: WordScript) {
  const normalized = font.toLowerCase();
  if (script === "gujarati") return RELIABLE_GUJARATI_FONTS.has(normalized);
  if (script === "devanagari") return RELIABLE_DEVANAGARI_FONTS.has(normalized);
  return RELIABLE_LATIN_FONTS.has(normalized);
}

export function compatibleWordFont(sourceFont: string, pdfFontName: string, text = "", sourceIsSystemFont = false) {
  const source = sourceFont
    .replace(/^[A-Z0-9]{6}\+/i, "")
    .replace(/[-_,](?:BoldItalic|BoldOblique|Bold|Semibold|Demi|Italic|Oblique|Regular|Roman)$/i, "")
    .trim();
  const usableSource = source && !/^(?:sans-serif|serif|monospace|g_d\d+_f\d+)$/i.test(source);
  const script = wordScriptForCharacter([...text].find((character) => wordScriptForCharacter(character) !== "common") ?? "A");
  if (usableSource && (sourceIsSystemFont || reliableForScript(source, script) && script === "latin")) return source;

  // Nirmala UI is Word's broadly available Indic fallback on Windows. It is
  // selected only when PDF.js cannot expose a usable original family name.
  if (GUJARATI.test(text) || DEVANAGARI.test(text)) return "Nirmala UI";
  if (script === "han") return "Microsoft YaHei";
  if (script === "kana") return "Yu Gothic";
  if (script === "hangul") return "Malgun Gothic";
  if (/courier|mono/i.test(sourceFont)) return "Courier New";
  if (/times/i.test(sourceFont) || /^serif$/i.test(sourceFont.trim())) return "Times New Roman";
  if (/courier|mono/i.test(pdfFontName)) return "Courier New";
  if (/times/i.test(pdfFontName) || /^serif$/i.test(pdfFontName.trim())) return "Times New Roman";
  return "Arial";
}

export function wordFontSlots(font: string, text: string) {
  const language = wordLanguageForText(text);
  return {
    ascii: font,
    hAnsi: font,
    eastAsia: font,
    cs: font,
    hint: ["zh-CN", "ja-JP", "ko-KR"].includes(language) ? "eastAsia" : language === "en-US" ? "default" : "cs",
  } as const;
}

/** Unicode strings from PDF.js are logical; never reverse their characters. */
export function isRtlText(text: string) {
  const firstLetter = [...text].find(character => /\p{Letter}/u.test(character));
  return Boolean(firstLetter && /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(firstLetter));
}

export function hasReliableUnicodeMapping(text: string) {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0xfffd
      || codePoint >= 0xe000 && codePoint <= 0xf8ff
      || codePoint >= 0xf0000 && codePoint <= 0xffffd
      || codePoint >= 0x100000 && codePoint <= 0x10fffd) return false;
  }
  return true;
}
