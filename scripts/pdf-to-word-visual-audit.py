"""Compare real application exports with sources; never equate XML checks with fidelity."""
import json
from pathlib import Path
from collections import Counter
from PIL import Image, ImageChops, ImageDraw, ImageStat
import pypdfium2 as pdfium

root = Path('tmp/pdf-word-general')
after = root / 'after'
out = root / 'visual'
out.mkdir(parents=True, exist_ok=True)
report = []
def rendered(page):
    return page.render(scale=1.5).to_pil().convert('RGB')
def compact(text):
    return ''.join(text.split())
for case in json.loads((after / 'conversion.json').read_text(encoding='utf-8')):
    if not case['ok'] or not (after / (case['name'] + '.pdf')).exists():
        continue
    name = case['name']
    source = pdfium.PdfDocument(case['source'])
    result = pdfium.PdfDocument(after / (name + '.pdf'))
    before_file = root / 'before' / (name + '.pdf')
    before = pdfium.PdfDocument(before_file) if before_file.exists() else None
    edits = pdfium.PdfDocument(after / (name + '-edited.pdf'))
    row = dict(name=name, sourcePages=len(source), outputPages=len(result), pages=[])
    for index in range(min(len(source), len(result))):
        src, dst = rendered(source[index]), rendered(result[index])
        panels = [('Source PDF', src)]
        if before and index < len(before): panels.append(('Before (WPS)', rendered(before[index])))
        panels.append(('After (WPS)', dst))
        canvas = Image.new('RGB', (sum(im.width for _,im in panels), max(im.height for _,im in panels)+35), 'white')
        draw = ImageDraw.Draw(canvas)
        x=0
        for label, im in panels:
            draw.text((x+10, 8), label, fill='black'); canvas.paste(im, (x,35)); x+=im.width
        canvas.save(out / f'{name}-{index+1}.png')
        source_text = source[index].get_textpage().get_text_range()
        result_text = result[index].get_textpage().get_text_range()
        counts_src, counts_dst = Counter(compact(source_text)), Counter(compact(result_text))
        changed_pixels = None
        if index < len(edits):
            edited = rendered(edits[index])
            if edited.size == dst.size:
                diff = ImageChops.difference(dst, edited).convert('L')
                changed_pixels = sum(count for value,count in enumerate(diff.histogram()) if value>15)
        row['pages'].append(dict(page=index+1, sameSize=src.size==dst.size,
            imageMAE=sum(ImageStat.Stat(ImageChops.difference(src, dst.resize(src.size))).mean)/3,
            missingNativeCharacters=sum((counts_src-counts_dst).values()),
            extraCharacters=sum((counts_dst-counts_src).values()),
            editChangedPixels=changed_pixels,
            sourceText=source_text, outputText=result_text))
    report.append(row)
(out/'metrics.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
for row in report:
    print(row['name'], row['sourcePages'], '->', row['outputPages'], [(p['missingNativeCharacters'], p['extraCharacters'], p['editChangedPixels']) for p in row['pages']])
