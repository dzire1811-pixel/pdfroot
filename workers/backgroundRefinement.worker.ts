/// <reference lib="webworker" />

import { AlphaRefinementInput, refineAlphaMask } from "../lib/background-removal/refineAlpha";

type RefinementRequest = AlphaRefinementInput & { requestId: number };

self.onmessage = (event: MessageEvent<RefinementRequest>) => {
  try {
    const { requestId, ...input } = event.data;
    const result = refineAlphaMask(input);
    const transfer = [result.alpha.buffer, result.foreground.buffer];
    if (result.debug) {
      transfer.push(
        result.debug.rawSegmentationAlpha.buffer,
        result.debug.automaticAlpha.buffer,
        result.debug.refinedAlphaBeforeValidation.buffer,
      );
    }
    self.postMessage(
      { requestId, result },
      { transfer },
    );
  } catch (error) {
    self.postMessage({
      requestId: event.data.requestId,
      error: error instanceof Error ? error.message : "Alpha refinement failed.",
    });
  }
};

export {};
