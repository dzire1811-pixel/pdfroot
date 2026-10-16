const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { processLocalAutoJob } = require('./local-auto.cjs');
const { isAnimated } = require('./image-compression.cjs');

function photo(alpha = false) {
  const canvas = createCanvas(640, 480), ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(640, 480); let seed = 19;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data[i] = seed & 255; pixels.data[i+1] = (seed >>> 8) & 255; pixels.data[i+2] = (seed >>> 16) & 255;
    pixels.data[i+3] = alpha ? (i / 4) % 256 : 255;
  }
  ctx.putImageData(pixels, 0, 0); return canvas;
}
async function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfroot-image-compress-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true})); return dir;
}
for (const format of ['jpeg', 'png', 'webp']) test(`${format}: actual preset plumbing produces three smaller distinct files without resizing`, async t => {
  const dir = await directory(t), canvas = photo();
  const original = await canvas.encode(format, 97), input = path.join(dir, `photo.${format === 'jpeg' ? 'jpg' : format}`);
  fs.writeFileSync(input, original); const sizes = [];
  for (const level of ['normal', 'low', 'heavy']) {
    const result = await processLocalAutoJob({slug:'compress-image', files:[input], outputDirectory:dir, compressionLevel:level});
    const bytes = fs.readFileSync(result.outputPaths[0]), image = await loadImage(bytes);
    assert.equal(image.width, 640); assert.equal(image.height, 480);
    assert.ok(bytes.length < original.length * .95);
    assert.match(result.outputPaths[0], new RegExp('compressed-' + level));
    assert.match(result.warnings.join(' '), /KB → .*KB \([\d.]+% smaller\)/);
    sizes.push(bytes.length);
  }
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], sizes.join(', '));
  assert.deepEqual(fs.readFileSync(input), original);
  console.log(format, 'original:', original.length, 'normal/low/heavy:', sizes.join('/'));
});

test('Transparent PNG keeps exact alpha at every level and Normal keeps all pixels', async t => {
  const dir = await directory(t), canvas = photo(true), original = await canvas.encode('png');
  const input = path.join(dir, 'transparent.png'); fs.writeFileSync(input, original);
  const before = canvas.getContext('2d').getImageData(0, 0, 640, 480).data;
  const sizes = [];
  for (const level of ['normal','low','heavy']) {
    const result = await processLocalAutoJob({slug:'compress-image', files:[input], outputDirectory:dir, compressionLevel:level});
    assert.match(result.outputPaths[0], /\.png$/);
    const bytes = fs.readFileSync(result.outputPaths[0]), image = await loadImage(bytes);
    const afterCanvas = createCanvas(640,480), ctx = afterCanvas.getContext('2d'); ctx.drawImage(image,0,0);
    const after = ctx.getImageData(0,0,640,480).data;
    for (let at=3; at<after.length; at+=4) assert.equal(after[at], before[at]);
    if (level === 'normal') assert.deepEqual(after,before);
    sizes.push(bytes.length);
  }
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2]);
  assert.deepEqual(fs.readFileSync(input),original);
});

test('Already compact JPEG is never enlarged; saved paths are collision safe and originals unchanged', async t => {
  const dir=await directory(t), original=await photo().encode('jpeg',5), input=path.join(dir,'small.jpg'); fs.writeFileSync(input,original);
  const paths=[];
  for (let i=0;i<2;i++) {
    const out=await processLocalAutoJob({slug:'compress-image',files:[input],outputDirectory:dir,compressionLevel:'normal'});
    assert.ok(fs.statSync(out.outputPaths[0]).size<=original.length);
    assert.match(out.warnings.join(' '),/Already compact/); paths.push(out.outputPaths[0]);
  }
  assert.notEqual(paths[0],paths[1]); assert.deepEqual(fs.readFileSync(input),original);
});

test('Animated PNG and WebP are detected rather than flattened', () => {
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12)]);
  const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPANIM'),Buffer.alloc(8)]);
  assert.equal(isAnimated(png),true); assert.equal(isAnimated(webp),true);
});
