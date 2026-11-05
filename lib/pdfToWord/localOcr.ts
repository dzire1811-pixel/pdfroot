export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type LocalOcrResult = {
  words: OcrWord[];
  confidence: number;
  lowConfidenceWords: number;
};

export const scanLanguages = {
  afr: "Afrikaans", amh: "Amharic", ara: "Arabic", asm: "Assamese", aze: "Azerbaijani",
  eus: "Basque", bel: "Belarusian", ben: "Bengali", bos: "Bosnian", bre: "Breton", bul: "Bulgarian",
  cat: "Catalan", ceb: "Cebuano", chr: "Cherokee", chi_sim: "Chinese (Simplified)", chi_tra: "Chinese (Traditional)",
  cos: "Corsican", hrv: "Croatian", ces: "Czech", dan: "Danish", nld: "Dutch", dzo: "Dzongkha",
  eng: "English", epo: "Esperanto", est: "Estonian", fao: "Faroese", fil: "Filipino", fin: "Finnish",
  fra: "French", fry: "Frisian", gla: "Scottish Gaelic", glg: "Galician", kat: "Georgian", deu: "German",
  ell: "Greek", guj: "Gujarati", hat: "Haitian Creole", heb: "Hebrew", hin: "Hindi",
  hun: "Hungarian", isl: "Icelandic", ind: "Indonesian", gle: "Irish", ita: "Italian", jpn: "Japanese",
  jav: "Javanese", kan: "Kannada", kaz: "Kazakh", khm: "Khmer", kir: "Kyrgyz", kor: "Korean", lao: "Lao",
  lat: "Latin", lav: "Latvian", lit: "Lithuanian", ltz: "Luxembourgish", mkd: "Macedonian", msa: "Malay",
  mal: "Malayalam", mlt: "Maltese", mri: "Maori", mar: "Marathi", mon: "Mongolian", mya: "Myanmar (Burmese)",
  nep: "Nepali", nor: "Norwegian", oci: "Occitan", ori: "Odia", pus: "Pashto", fas: "Persian",
  pol: "Polish", por: "Portuguese", pan: "Punjabi", que: "Quechua", ron: "Romanian", rus: "Russian",
  san: "Sanskrit", srp: "Serbian (Cyrillic)", srp_latn: "Serbian (Latin)", snd: "Sindhi", sin: "Sinhala",
  slk: "Slovak", slv: "Slovenian", spa: "Spanish", sun: "Sundanese", swa: "Swahili", swe: "Swedish",
  syr: "Syriac", tgk: "Tajik", tam: "Tamil", tat: "Tatar", tel: "Telugu", tha: "Thai", bod: "Tibetan",
  tir: "Tigrinya", ton: "Tongan", tur: "Turkish", uig: "Uyghur", ukr: "Ukrainian", urd: "Urdu",
  uzb: "Uzbek", vie: "Vietnamese", cym: "Welsh", yid: "Yiddish", yor: "Yoruba",
  sqi: "Albanian", grc: "Ancient Greek", hye: "Armenian", aze_cyrl: "Azerbaijani (Cyrillic)",
  chi_sim_vert: "Chinese (Simplified, vertical)", chi_tra_vert: "Chinese (Traditional, vertical)",
  div: "Dhivehi", equ: "Math and equations", iku: "Inuktitut", jpn_vert: "Japanese (vertical)",
  kor_vert: "Korean (vertical)", kmr: "Kurdish (Kurmanji)", enm: "Middle English", frm: "Middle French",
  kat_old: "Old Georgian", ita_old: "Old Italian", spa_old: "Old Spanish", frk: "Historical German (Fraktur)", uzb_cyrl: "Uzbek (Cyrillic)",
} as const;

export type ScanLanguage = "auto" | keyof typeof scanLanguages;

async function withOcrTimeout<T>(job: Promise<T>, milliseconds: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([job, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("The local OCR worker timed out.")), milliseconds);
    })]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Remove recognized words only where the surrounding scan provides a flat background. */
export function planScanTextCleanup(context: CanvasRenderingContext2D, words: OcrWord[]) {
  const { width, height } = context.canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const patches: Array<{ x: number; y: number; width: number; height: number; color: string; word: OcrWord }> = [];
  for (const word of words) {
    const { bbox } = word;
    if (!/[\p{Letter}\p{Number}]/u.test(word.text)) continue;
    const left = Math.max(0, Math.floor(bbox.x0) - 1);
    const right = Math.min(width - 1, Math.ceil(bbox.x1) + 1);
    const top = Math.max(0, Math.floor(bbox.y0) - 1);
    const bottom = Math.min(height - 1, Math.ceil(bbox.y1) + 1);
    if (left === 0 || top === 0 || right === width - 1 || bottom === height - 1 || right <= left || bottom <= top) continue;
    const corners = [
      (width * (top - 1) + left - 1) * 4, (width * (top - 1) + right + 1) * 4,
      (width * (bottom + 1) + left - 1) * 4, (width * (bottom + 1) + right + 1) * 4,
    ];
    const background = [0, 1, 2].map(channel => {
      const values = corners.map(offset => data[offset + channel]).sort((a, b) => a - b);
      return Math.round((values[1] + values[2]) / 2);
    });
    const matchesBackground = (x: number, y: number) => {
      const offset = (width * y + x) * 4;
      return Math.abs(data[offset] - background[0]) <= 50
        && Math.abs(data[offset + 1] - background[1]) <= 50
        && Math.abs(data[offset + 2] - background[2]) <= 50;
    };
    // Minor antialiasing at the boundary is normal. A dense or connected
    // crossing suggests the patch would erase an adjoining rule or image.
    let occupied = 0;
    let crossing = 0;
    for (let x = left; x <= right; x += 1) {
      const above = Number(!matchesBackground(x, top - 1));
      const below = Number(!matchesBackground(x, bottom + 1));
      occupied += above + below;
      crossing += above * below;
    }
    for (let y = top; y <= bottom; y += 1) {
      const before = Number(!matchesBackground(left - 1, y));
      const after = Number(!matchesBackground(right + 1, y));
      occupied += before + after;
      crossing += before * after;
    }
    const perimeter = 2 * (right - left + bottom - top + 2);
    if (occupied / perimeter > 0.18 || crossing >= 2) continue;
    patches.push({ x: left, y: top, width: right - left + 1, height: bottom - top + 1,
      color: `rgb(${background.join(",")})`, word });
  }
  return {
    words: patches.map(patch => patch.word),
    apply() {
      for (const patch of patches) {
        context.fillStyle = patch.color;
        context.fillRect(patch.x, patch.y, patch.width, patch.height);
      }
    },
  };
}

export async function createLocalOcrEngine(language: ScanLanguage = "auto") {
  const { createWorker, PSM } = await import("tesseract.js");
  const local = ["eng", "hin", "guj"];
  const codes = language === "auto" ? local : [...new Set([language, "eng"])];
  const bundled = codes.every(code => local.includes(code));
  let rejectInitialization: (reason: unknown) => void = () => {};
  const initializationError = new Promise<never>((_, reject) => { rejectInitialization = reject; });
  const startingWorker = createWorker(codes, undefined, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: bundled ? "/ocr/" : "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0/",
    gzip: bundled,
    errorHandler: rejectInitialization,
  });
  const worker = await withOcrTimeout(Promise.race([startingWorker, initializationError]), 30_000).catch(error => {
    void startingWorker.then(lateWorker => lateWorker.terminate()).catch(() => undefined);
    throw error;
  });
  let workerFailed = false;
  return {
    async recognize(image: HTMLCanvasElement, singleLine = false): Promise<LocalOcrResult> {
      if (workerFailed) throw new Error("The local OCR worker is unavailable.");
      const job = worker.setParameters({ tessedit_pageseg_mode: singleLine ? PSM.SINGLE_LINE : PSM.AUTO })
        .then(() => worker.recognize(image, {}, { blocks: true, text: true }));
      const result = await withOcrTimeout(job, 45_000).catch(async error => {
        workerFailed = true;
        await worker.terminate();
        throw error;
      });
      const blocks = (result.data as unknown as { blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }> }).blocks ?? [];
      const words = blocks.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []).flatMap((line) => line.words ?? [])
        .filter((word) => word.text?.trim());
      const confidence = words.length ? words.reduce((sum, word) => sum + Number(word.confidence ?? 0), 0) / words.length : 0;
      return { words, confidence, lowConfidenceWords: words.filter((word) => Number(word.confidence ?? 0) < 65).length };
    },
    terminate: () => worker.terminate(),
  };
}
