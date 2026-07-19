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

export async function createLocalOcrEngine(languages = ["eng", "hin", "guj"]) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(languages, undefined, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: "/ocr/",
  });
  return {
    async recognize(image: HTMLCanvasElement, onProgress?: (progress: number) => void): Promise<LocalOcrResult> {
      if (onProgress) onProgress(0.05);
      const result = await worker.recognize(image, {}, { blocks: true, text: true });
      const blocks = (result.data as unknown as { blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }> }> }).blocks ?? [];
      const words = blocks.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []).flatMap((line) => line.words ?? [])
        .filter((word) => word.text?.trim());
      if (onProgress) onProgress(1);
      const confidence = words.length ? words.reduce((sum, word) => sum + Number(word.confidence ?? 0), 0) / words.length : 0;
      return { words, confidence, lowConfidenceWords: words.filter((word) => Number(word.confidence ?? 0) < 65).length };
    },
    terminate: () => worker.terminate(),
  };
}
