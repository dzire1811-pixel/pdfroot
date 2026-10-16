const { parentPort, workerData } = require('node:worker_threads');
const { processExactPdfFiles } = require('./exact-kb-pdf.cjs');
processExactPdfFiles(workerData.files, workerData.options).then(
  results => parentPort.postMessage({ results }),
  error => parentPort.postMessage({ error: error.message }),
);
