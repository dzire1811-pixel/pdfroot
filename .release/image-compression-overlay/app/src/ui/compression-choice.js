const params = new URLSearchParams(window.location.search);
const count = Math.max(1, Number(params.get('files')) || 1);
const image = params.get('kind') === 'image';
document.querySelector('#file-count').textContent = image
  ? `${count === 1 ? 'Your image' : count + ' images'} will save beside the original. Dimensions stay the same.`
  : count === 1 ? 'Choose a compression level. Your PDF stays in the same folder.'
    : `Choose a compression level. ${count} PDFs will stay in their original folder.`;
if (image) {
  document.body.classList.add('image-compression');
  document.title = 'PDFRoot — Compress Image';
  document.querySelector('#choice-title').textContent = 'Compress Image';
  const descriptions = { normal: 'High quality · gentle compression', low: 'Smaller file · balanced quality', heavy: 'Strong compression · more visible quality loss' };
  document.querySelectorAll('[data-level]').forEach(button => {
    button.querySelector('small').textContent = descriptions[button.dataset.level];
  });
  const note = document.createElement('p');
  note.className = 'subtitle';
  note.style.cssText = 'margin:12px 0 0;font-size:11px;line-height:1.5';
  note.textContent = 'Opaque PNG photos may save as JPG. Transparency stays PNG; Low/Heavy reduce colours. Originals are kept.';
  document.querySelector('main').append(note);
}
function choose(level) { window.pdfrootDesktop.choosePdfCompression(level); }
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => choose(button.dataset.level)));
document.querySelector('#close-choice').addEventListener('click', () => choose(''));
window.addEventListener('keydown', event => { if (event.key === 'Escape') choose(''); });
