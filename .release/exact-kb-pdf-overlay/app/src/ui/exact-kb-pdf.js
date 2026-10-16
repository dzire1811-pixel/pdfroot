const api = window.pdfrootDesktop;
const target = document.querySelector('#target');
const unit = document.querySelector('#unit');
const results = document.querySelector('#results');
let busy = false;
function showFiles(files) {
  document.querySelector('#files').textContent = files.length ? files.map(item => item.name).join('\n') : 'Choose a PDF to get started.';
}
function updateTarget() {
  const bytes = Number(target.value) * Number(unit.value);
  document.querySelector('#target-bytes').textContent = Number.isFinite(bytes) && bytes > 0 ? `${Math.round(bytes).toLocaleString('en-US')} bytes exactly` : 'Enter a target size.';
}
function status(message, error = false) {
  results.hidden = false; results.replaceChildren();
  const p = document.createElement('p'); p.className = error ? 'error' : ''; p.textContent = message; results.append(p);
}
document.querySelector('#choose').addEventListener('click', async () => {
  try { const response = await api.exactPdfChoose(); if (response?.error) status(response.error, true); else if (response?.files) { showFiles(response.files); results.hidden = true; } }
  catch { status('Could not choose a PDF. Please try again.', true); }
});
document.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => { target.value = button.dataset.size; updateTarget(); }));
target.addEventListener('input', updateTarget); unit.addEventListener('change', updateTarget);
document.querySelector('#settings').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; busy = true;
  document.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
  status('Checking lossless options and verifying the final size…');
  try {
    const response = await api.exactPdfRun({ targetKb: target.value, bytesPerKb: Number(unit.value) });
    if (response.error) { status(response.error, true); return; }
    results.replaceChildren();
    for (const result of response.results) {
      const row = document.createElement('div'); row.className = 'result';
      const name = document.createElement('h3'); name.textContent = result.source.split(/[\\/]/).pop(); row.append(name);
      const text = document.createElement('p'); text.className = result.ok ? 'success' : 'error';
      text.textContent = result.ok ? `Created · ${result.targetBytes.toLocaleString('en-US')} bytes exactly · ${result.pages} page(s)\nQuality unchanged. ${result.paddingBytes ? 'Padding added to reach the exact size.' : 'No padding needed.'}` : result.message;
      row.append(text);
      if (result.ok) { const reveal = document.createElement('button'); reveal.type = 'button'; reveal.textContent = 'Show saved PDF'; reveal.addEventListener('click', () => api.exactPdfReveal(result.outputPath)); row.append(reveal); }
      else if (result.bestBytes) { const larger = document.createElement('button'); larger.type = 'button'; larger.textContent = 'Use a larger target'; larger.addEventListener('click', () => { target.value = Math.ceil(result.bestBytes / Number(unit.value)); updateTarget(); target.focus(); }); row.append(larger); }
      results.append(row);
    }
  } catch { status('Processing could not finish. Please try again.', true); }
  finally { busy = false; document.querySelectorAll('button, input, select').forEach(element => { element.disabled = false; }); }
});
updateTarget(); api.exactPdfFiles().then(showFiles).catch(() => status('Could not load selected PDFs.', true));
