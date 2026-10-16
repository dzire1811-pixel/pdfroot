const api = window.pdfrootDesktop;
const target = document.querySelector('#target');
const results = document.querySelector('#results');
let busy = false;
function showFiles(files) {
  const label = document.querySelector('#files');
  label.textContent = files.length > 1 ? `${files.length} PDFs selected` : files[0]?.name || 'Choose a PDF to get started.';
  label.title = files.map(item => item.name).join('\n');
  document.querySelector('#choose').textContent = files.length ? 'Change' : 'Choose PDF';
}
function status(message, className = '') {
  results.hidden = false; results.replaceChildren();
  const p = document.createElement('p'); p.className = className; p.textContent = message; results.append(p);
}
function clearStatus() { results.hidden = true; results.replaceChildren(); }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button, input').forEach(element => { element.disabled = value; });
  document.querySelector('#create').textContent = value ? 'Creating…' : 'Create PDF';
}
function action(row, label, handler, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.addEventListener('click', handler); row.append(button);
}
async function createPdf(allowImageCompression = false, allowStrongCompression = false) {
  if (busy) return;
  const targetKb = target.value;
  if (!Number.isInteger(Number(targetKb)) || Number(targetKb) < 5 || Number(targetKb) > 100000) { status('Enter a whole number from 5 to 100,000 KB.', 'error'); return; }
  setBusy(true); status(allowStrongCompression ? 'Trying smaller page images for your target…' : allowImageCompression ? 'Creating PDF with the best image quality that fits…' : 'Creating your PDF…');
  try {
    const response = await api.exactPdfRun({ targetKb, bytesPerKb: 1000, allowImageCompression, allowStrongCompression });
    if (response.error) { status(response.error, 'error'); return; }
    results.hidden = false; results.replaceChildren();
    for (const result of response.results || []) {
      const row = document.createElement('div'); row.className = 'result';
      if (response.results.length > 1) { const name = document.createElement('h2'); name.textContent = result.source.split(/[\\/]/).pop(); row.append(name); }
      const text = document.createElement('p');
      if (result.ok) {
        text.className = 'success';
        text.textContent = `Saved: ${Number(targetKb).toLocaleString('en-US')} KB exactly. ${result.method === 'strong-compressed' ? 'Strong compression used. Pages are images; check readability before upload.' : result.qualityChanged ? 'Images compressed; dimensions unchanged.' + (result.imageQuality < 20 ? ' Strong compression used: check readability before upload.' : '') : 'Original quality preserved.'}`;
        row.append(text); action(row, 'Show PDF', () => api.exactPdfReveal(result.outputPath));
      } else if (result.code === 'TARGET_UNREACHABLE' && result.bestBytes) {
        const minimumKb = Math.ceil(Math.min(result.bestBytes, ...(allowImageCompression ? [result.compressionBestBytes || Infinity] : []), ...(allowStrongCompression ? [result.strongBestBytes || Infinity] : [])) / 1000);
        text.className = 'notice';
        text.textContent = allowImageCompression
          ? `The methods tried did not reach ${Number(targetKb).toLocaleString('en-US')} KB. Smallest found: ${minimumKb.toLocaleString('en-US')} KB.`
          : `The lossless methods tried did not reach ${Number(targetKb).toLocaleString('en-US')} KB. Smallest found: ${minimumKb.toLocaleString('en-US')} KB. Image compression may reduce quality.`;
        row.append(text);
        if (!allowImageCompression) action(row, `Compress to ${Number(targetKb).toLocaleString('en-US')} KB`, () => createPdf(true), 'compress');
        if (allowImageCompression && !allowStrongCompression) {
          const warning = document.createElement('p'); warning.className = 'notice';
          warning.textContent = 'Strong compression lowers resolution. Text and forms become images; clarity may decrease.'; row.append(warning);
          action(row, `Strong compress to ${Number(targetKb).toLocaleString('en-US')} KB`, () => createPdf(true, true), 'compress strong');
        }
        action(row, `Create ${minimumKb.toLocaleString('en-US')} KB`, () => { target.value = minimumKb; return createPdf(allowImageCompression, allowStrongCompression); });
      } else { text.className = 'error'; text.textContent = result.message || 'Could not create this PDF. Please try another file.'; row.append(text); }
      results.append(row);
    }
  } catch { status('Could not finish. Please try again.', 'error'); }
  finally { setBusy(false); }
}
document.querySelector('#choose').addEventListener('click', async () => {
  try { const response = await api.exactPdfChoose(); if (response?.error) status(response.error, 'error'); else if (response?.files) { showFiles(response.files); clearStatus(); } }
  catch { status('Could not choose a PDF. Please try again.', 'error'); }
});
document.querySelector('#settings').addEventListener('submit', event => { event.preventDefault(); void createPdf(false); });
target.addEventListener('input', clearStatus);
function close() { if (!busy) void api.exactPdfClose(); }
document.querySelector('#cancel').addEventListener('click', close); document.querySelector('#cancel-top').addEventListener('click', close);
window.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
new ResizeObserver(() => { void api.exactPdfResize(Math.ceil(document.querySelector('main').getBoundingClientRect().height)); }).observe(document.querySelector('main'));
api.exactPdfFiles().then(showFiles).catch(() => status('Could not load selected PDFs.', 'error'));
window.addEventListener('load', () => { target.focus(); target.select(); });
