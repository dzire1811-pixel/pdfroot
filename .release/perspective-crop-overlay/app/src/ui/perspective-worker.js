"use strict";
importScripts("perspective-math.js");
self.onmessage = ({ data: job }) => {
  try {
    const result = PerspectiveMath.transform(new Uint8ClampedArray(job.buffer), job.width, job.height, job.points);
    self.postMessage({ width: result.width, height: result.height, buffer: result.data.buffer }, [result.data.buffer]);
  } catch (error) { self.postMessage({ error: error.message || "Could not apply Free Transform." }); }
};
