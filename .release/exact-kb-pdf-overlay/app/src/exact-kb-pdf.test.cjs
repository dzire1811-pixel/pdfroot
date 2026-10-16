const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { PDFDocument, PDFName, PDFRawStream, PDFDict, StandardFonts, rgb } = require('pdf-lib');
const { parseTarget, createExactPdf, processExactPdfFiles } = require('./exact-kb-pdf.cjs');
async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]); page.drawText('PDFRoot Exact KB - original selectable text', { x: 20, y: 350, size: 10 });
  page.drawRectangle({x: 20, y: 240, width: 90, height: 60, color: rgb(0.2, 0.4, 0.7)});
  const form = doc.getForm(); const field = form.createTextField('name'); field.setText('Anand'); field.addToPage(page, { x: 20, y: 150, width: 160, height: 25 });
  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  const raw = doc.context.stream(Buffer.from('q\nQ\n'.repeat(8000)));
  const ref = doc.context.register(raw); page.node.addContentStream(ref);
  return Buffer.from(await doc.save({useObjectStreams: false, updateFieldAppearances: false}));
}
function streams(doc) {
  return doc.context.enumerateIndirectObjects().filter(([,o]) => o instanceof PDFRawStream && !['/ObjStm','/XRef'].includes(o.dict.get(PDFName.of('Type'))?.toString())).map(([ref,o]) => [String(ref),o]);
}
test('targets use explicit decimal or binary units, without byte rounding surprises', () => {
  assert.equal(parseTarget('500'), 500000); assert.equal(parseTarget('500',1024),512000); assert.equal(parseTarget('0.001'),1);
  for (const value of ['', 'abc', '-1', '0', '1e3', 'Infinity', '999999999']) assert.throws(() => parseTarget(value));
  assert.throws(() => parseTarget('0.001',1024)); assert.throws(() => parseTarget('500',1001));
});
test('larger targets preserve original byte prefix and place startxref close to final EOF', async () => {
  const original = await fixture();
  const result = await createExactPdf(original,{targetKb:500});
  assert.equal(result.data.length,500000); assert.equal(result.method,'original');
  const position=original.lastIndexOf(Buffer.from('startxref'));
  assert.deepEqual(result.data.subarray(0,position),original.subarray(0,position));
  assert.ok(result.data.length-result.data.lastIndexOf(Buffer.from('startxref'))<100);
  const doc=await PDFDocument.load(result.data); assert.equal(doc.getForm().getTextField('name').getText(),'Anand');
});
test('lossless reduction preserves decoded stream bytes and interactive form values', async () => {
  const original=await fixture(); const result=await createExactPdf(original,{targetKb:10});
  assert.equal(result.data.length,10000);assert.equal(result.method,'lossless');
  const a=await PDFDocument.load(original),b=await PDFDocument.load(result.data);
  assert.equal(b.getForm().getTextField('name').getText(),'Anand');
  const zlib=require('node:zlib');const before=streams(a),after=new Map(streams(b));
  for(const [ref,stream] of before){const output=after.get(ref);assert.ok(output,ref);
    const decode=s=>s.dict.get(PDFName.of('Filter'))?.toString()==='/FlateDecode'?zlib.inflateSync(s.contents):s.contents;
    assert.deepEqual(Buffer.from(decode(output)),Buffer.from(decode(stream)),ref);
  }
});
test('an already exact file returns unchanged bytes and an impossible target returns actionable details', async () => {
  const original=await fixture(); const exact=await createExactPdf(original,{targetKb:(original.length/1000).toFixed(3)});assert.deepEqual(exact.data,original);
  await assert.rejects(createExactPdf(original,{targetKb:1}),e=>e.code==='TARGET_UNREACHABLE'&&e.bestBytes>1000&&e.bestBytes<original.length);
});
test('image streams retain every encoded byte and all original dimensions', async () => {
  const {Jimp,JimpMime}=require('jimp');const jpg=await new Jimp({width:150,height:75,color:0x13579aff}).getBuffer(JimpMime.jpeg,{quality:91});
  const doc=await PDFDocument.create();const image=await doc.embedJpg(Uint8Array.from(jpg));const page=doc.addPage([300,400]);page.drawImage(image,{x:10,y:10,width:150,height:75});
  page.node.addContentStream(doc.context.register(doc.context.stream(Buffer.from('q\nQ\n'.repeat(8000)))));
  const original=await doc.save({useObjectStreams:false});const result=await createExactPdf(original,{targetKb:10});
  const output=await PDFDocument.load(result.data);const imageStream=streams(output).find(([,s])=>s.dict.get(PDFName.of('Subtype'))?.toString()==='/Image')[1];
  assert.deepEqual(Buffer.from(imageStream.contents),Buffer.from(jpg));assert.equal(imageStream.dict.get(PDFName.of('Width')).asNumber(),150);assert.equal(imageStream.dict.get(PDFName.of('Height')).asNumber(),75);
});
test('signed PDFs, malformed PDFs and dynamic XFA rewrites are rejected', async () => {
  const original=await fixture();const doc=await PDFDocument.load(original);
  doc.context.register(doc.context.obj({Type:'Sig',ByteRange:[0,10,20,30]}));
  await assert.rejects(createExactPdf(await doc.save(),{targetKb:500}),e=>e.code==='SIGNED_PDF');
  await assert.rejects(createExactPdf(Buffer.from('garbage'),{targetKb:500}),e=>e.code==='INVALID_PDF');
  const xfa=await PDFDocument.load(original);xfa.catalog.lookup(PDFName.of('AcroForm'),PDFDict).set(PDFName.of('XFA'),xfa.context.obj(['x','y']));
  await assert.rejects(createExactPdf(await xfa.save({useObjectStreams:false}),{targetKb:1}),e=>e.code==='XFA_PDF');
});
test('batch failure saves nothing for failed files; successful copies never overwrite source or prior results', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pdfroot-exact-test-'));
  try {
    const source=path.join(directory,'ગુજરાતી document.pdf'),bad=path.join(directory,'bad.pdf');const original=await fixture();await fs.writeFile(source,original);await fs.writeFile(bad,'bad');
    const first=await processExactPdfFiles([source,bad],{targetKb:10,bytesPerKb:1000});assert.equal(first[0].ok,true);assert.equal(first[1].ok,false);
    assert.equal((await fs.stat(first[0].outputPath)).size,10000);assert.deepEqual(await fs.readFile(source),original);
    const second=await processExactPdfFiles([source],{targetKb:10});assert.notEqual(second[0].outputPath,first[0].outputPath);
    const count=(await fs.readdir(directory)).length;const failed=await processExactPdfFiles([source],{targetKb:1});assert.equal(failed[0].ok,false);assert.equal((await fs.readdir(directory)).length,count);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('background worker produces a real exact-size PDF', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pdfroot-exact-worker-'));
  try {const file=path.join(directory,'a.pdf');await fs.writeFile(file,await fixture());const response=await new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'exact-kb-pdf-worker.cjs'),{workerData:{files:[file],options:{targetKb:10}}});worker.once('message',resolve);worker.once('error',reject);});assert.equal(response.results[0].ok,true);assert.equal((await fs.stat(response.results[0].outputPath)).size,10000);}finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('JPEG compression requires explicit true and keeps original dimensions, native text and form values', async () => {
  const {createCanvas}=require('@napi-rs/canvas');
  const canvas=createCanvas(420,500), ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,420,500);
  // Deterministic varied content makes a high-quality image meaningfully large.
  const pixels=ctx.getImageData(0,0,420,500);let seed=17;
  for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);const jpg=await canvas.encode('jpeg',99);
  const doc=await PDFDocument.create();const image=await doc.embedJpg(Uint8Array.from(jpg));const page=doc.addPage([420,600]);page.drawImage(image,{x:0,y:0,width:420,height:500});page.drawText('Original native text',{x:20,y:540,size:15});
  const field=doc.getForm().createTextField('kept');field.setText('Original value');field.addToPage(page,{x:20,y:505,width:180,height:24});doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  const source=Buffer.from(await doc.save({updateFieldAppearances:false}));const kb=Math.floor(source.length*0.72/1000);
  for(const allowImageCompression of [undefined,false,'true',1])await assert.rejects(createExactPdf(source,{targetKb:kb,allowImageCompression}),e=>e.code==='TARGET_UNREACHABLE');
  const result=await createExactPdf(source,{targetKb:kb,allowImageCompression:true});assert.equal(result.data.length,kb*1000);assert.equal(result.qualityChanged,true);assert.equal(result.method,'image-compressed');assert.ok(result.imageQuality>=20);
  const output=await PDFDocument.load(result.data);assert.equal(output.getForm().getTextField('kept').getText(),'Original value');
  const original=await PDFDocument.load(source);const originalStreams=streams(original), outputStreams=new Map(streams(output));
  for(const[ref,stream]of originalStreams){const saved=outputStreams.get(ref);if(stream.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'){assert.equal(saved.dict.get(PDFName.of('Width')).asNumber(),420);assert.equal(saved.dict.get(PDFName.of('Height')).asNumber(),500);}else assert.deepEqual(Buffer.from(saved.contents),Buffer.from(stream.contents));}
  // With a larger target, an opt-in still leaves already-fitting images intact.
  const larger=await createExactPdf(source,{targetKb:Math.ceil(source.length/1000)+1,allowImageCompression:true});assert.equal(larger.qualityChanged,false);assert.equal(larger.method,'original');
});
