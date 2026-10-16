const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, degrees, StandardFonts, PDFName, PDFDict } = require('pdf-lib');
const { createCanvas } = require('@napi-rs/canvas');
const { createExactPdf } = require('./exact-kb-pdf.cjs');
const { strongCompressPdf } = require('./exact-kb-pdf-strong.cjs');

async function fixture() {
  const canvas=createCanvas(600,800),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(600,800);let seed=23;
  for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  const doc=await PDFDocument.create(),png=await doc.embedPng(await canvas.encode('png'));
  for(let i=0;i<2;i++){
    const page=doc.addPage([300,400]); page.drawImage(png,{x:0,y:0,width:300,height:400});
    if(i===1)page.setRotation(degrees(90));
  }
  const first=doc.getPage(0); first.drawText('Government form sample',{x:20,y:365,size:14});
  const field=doc.getForm().createTextField('name'); field.setText('Anand');field.addToPage(first,{x:20,y:320,width:150,height:24});
  doc.getForm().updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  return Buffer.from(await doc.save());
}

test('70 KB PNG PDF requires explicit Strong opt-in, keeps all pages and display geometry', async()=>{
  const original=await fixture(),snapshot=Buffer.from(original);
  for(const allowStrongCompression of [false,undefined,'true',1]){
    await assert.rejects(createExactPdf(original,{targetKb:70,allowImageCompression:true,allowStrongCompression}),e=>e.code==='TARGET_UNREACHABLE');
  }
  const result=await createExactPdf(original,{targetKb:70,allowStrongCompression:true});
  assert.equal(result.data.length,70000); assert.equal(result.method,'strong-compressed');assert.equal(result.qualityChanged,true);
  assert.ok(result.renderDpi>=48&&result.renderDpi<=150);assert.ok(result.imageQuality>=35);
  const output=await PDFDocument.load(result.data);assert.equal(output.getPageCount(),2);
  assert.deepEqual(output.getPages().map(page=>page.getSize()),[{width:300,height:400},{width:400,height:300}]);
  assert.equal(output.getForm().getFields().length,0,'Strong output must be described as flattened');
  assert.deepEqual(original,snapshot);
  console.log('Strong PNG sample:',original.length,'→',result.data.length,'DPI',result.renderDpi,'JPEG quality',result.imageQuality);
});

test('unreachable strong targets return the smallest tried result without pretending it is a hard minimum',async()=>{
  const original=await fixture();
  await assert.rejects(createExactPdf(original,{targetKb:1,allowStrongCompression:true}),e=>e.code==='TARGET_UNREACHABLE'&&e.strongBestBytes>1000&&e.strongBestBytes<e.bestBytes&&/Smallest result found/.test(e.message));
});

test('explicit Strong does not rasterize already-fitting PDFs and still rejects signed/XFA changes',async()=>{
  const original=await fixture();
  const fitting=await createExactPdf(original,{targetKb:Math.ceil(original.length/1000)+1,allowStrongCompression:true});
  assert.equal(fitting.method,'original');assert.equal(fitting.qualityChanged,false);
  const signed=await PDFDocument.load(original);signed.context.register(signed.context.obj({Type:'Sig',ByteRange:[0,1,2,3]}));
  await assert.rejects(createExactPdf(await signed.save(),{targetKb:70,allowStrongCompression:true}),e=>e.code==='SIGNED_PDF');
  const xfa=await PDFDocument.load(original);xfa.catalog.lookup(PDFName.of('AcroForm'),PDFDict).set(PDFName.of('XFA'),xfa.context.obj(['x','y']));
  await assert.rejects(createExactPdf(await xfa.save(),{targetKb:70,allowStrongCompression:true}),e=>e.code==='XFA_PDF');
});

test('strong renderer resources are released after an unsupported page count',async()=>{
  const doc=await PDFDocument.create();for(let i=0;i<51;i++)doc.addPage([100,100]);
  await assert.rejects(strongCompressPdf(await doc.save(),70000),/up to 50 pages/);
});
