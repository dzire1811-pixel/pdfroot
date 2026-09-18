import 'regenerator-runtime/runtime';
import {test,expect,type Page} from '@playwright/test';
import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {drawResolvedText,finalizeNativeFonts} from '../lib/editPdf/nativeFonts';
import type {ExistingTextEdit} from '../lib/editPdf/nativeText';
import fs from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {stubLocalSpeedInsights} from './playwright-local-telemetry';
import {waitForEditorLayout} from './edit-pdf-layout';
async function fixture(rotation=0,unicode=''){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=unicode?await doc.embedFont(await fs.readFile('public/fonts/edit-pdf/noto-sans-gujarati-gujarati-400-normal.ttf')):await doc.embedFont(StandardFonts.TimesRoman);
 const page=doc.addPage(rotation===180?[792,700]:rotation===270?[595,842]:[612,792]);page.setRotation(degrees(rotation));
 page.drawRectangle({x:40,y:570,width:520,height:90,color:rgb(.85,.93,.98)});
 for(const x of [40,300,560])page.drawLine({start:{x,y:570},end:{x,y:660},thickness:1});
 for(const y of [570,615,660])page.drawLine({start:{x:40,y},end:{x:560,y},thickness:1});
 if(unicode){drawResolvedText(page,{font,family:'Noto',key:'fixture',status:'embedded',bytes:await fs.readFile('public/fonts/edit-pdf/noto-sans-gujarati-gujarati-400-normal.ttf')},{newText:unicode,fontSize:10.5,color:'#193399'} as ExistingTextEdit,60,630);}else page.drawText('Anand Joshi',{x:60,y:630,font,size:10.5,color:rgb(.1,.2,.6)});
 page.drawText(unicode?'૧૨૩':'123456',{x:320,y:630,font,size:10.5});
 if(!unicode){const bold=await doc.embedFont(StandardFonts.HelveticaBold);page.drawText('Mathematics',{x:60,y:590,font:bold,size:12});page.drawText('SYSTEM',{x:320,y:590,font,size:12});
 let x=60;for(const str of ['An','and',' Jos','hi']){page.drawText(str,{x,y:500,font,size:10.5});x+=font.widthOfTextAtSize(str,10.5);}}
 await finalizeNativeFonts(doc);
 return {name:'marksheet-style.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
async function precisionFixture(){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage([400,300]);page.drawText('Precision',{x:42,y:190,font,size:18.919148984502094,color:rgb(.15,.2,.25)});
 return {name:'precision.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
async function open(page:Page,file:Awaited<ReturnType<typeof fixture>>){
 await stubLocalSpeedInsights(page);await page.goto('/edit-pdf');
 const reject=page.getByRole('button',{name:'Reject non-essential'});if(await reject.isVisible())await reject.click();
 await page.getByLabel('Choose PDF',{exact:true}).setInputFiles(file);
 await expect(page.locator('[data-native-region]').first()).toBeVisible({timeout:60000});
}
async function exportFile(page:Page){
 await page.getByRole('button',{name:'Apply Changes',exact:true}).filter({visible:true}).click();
 await expect(page.getByRole('heading',{name:'Your edited PDF is ready!'})).toBeVisible({timeout:60000});
 const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF'}).click();return fs.readFile((await (await pending).path())!);
}
async function inspect(page:Page,bytes:Buffer){
 await page.route('**/__native_pdfjs.mjs',r=>r.fulfill({path:path.join(process.cwd(),'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),contentType:'application/javascript'}));
 return page.evaluate(async data=>{
 // @ts-expect-error browser fixture module
 const pdfjs=await import('/__native_pdfjs.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
 const doc=await pdfjs.getDocument({data:new Uint8Array(data)}).promise,p=await doc.getPage(1),content=await p.getTextContent();
 const canvas=document.createElement('canvas'),v=p.getViewport({scale:2,rotation:0});canvas.width=v.width;canvas.height=v.height;await p.render({canvas,viewport:v}).promise;
 const pixels=Array.from(canvas.getContext('2d')!.getImageData(120,306,130,30).data);
 const image=canvas.toDataURL();await doc.loadingTask.destroy();return {items:content.items.filter((i:{str?:string})=>i.str).map((i:{str:string;transform:number[]})=>({str:i.str,transform:i.transform})),image,pixels};
 },Array.from(bytes));
}
for(const rotation of [0,90,180,270])test(`native table text edits preserve position, color and page rotation ${rotation}`,async({page},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const file=await fixture(rotation);await open(page,file);
 const region=page.getByRole('button',{name:'Edit existing text: Anand Joshi',exact:true}).first();
 await region.dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await expect(input).toHaveValue('Anand Joshi');
 await input.fill('Anand Kumar');await input.press('Control+Enter');await expect(input).toHaveCount(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(region).toHaveAttribute('aria-label','Edit existing text: Anand Joshi');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 const bytes=await exportFile(page),result=await inspect(page,bytes),replacement=result.items.find((i:{str:string;transform:number[]})=>i.str==='Anand Kumar');expect(replacement).toBeTruthy();expect(replacement!.transform[4]).toBeCloseTo(60,1);expect(replacement!.transform[5]).toBeCloseTo(630,1);expect(Math.hypot(replacement!.transform[0],replacement!.transform[1])).toBeCloseTo(10.5,1);
 const pdf=await PDFDocument.load(bytes);expect(pdf.getPage(0).getRotation().angle).toBe(rotation);
 await fs.writeFile(info.outputPath('edited.pdf'),bytes);await fs.writeFile(info.outputPath('edited.png'),Buffer.from(result.image.split(',')[1],'base64'));expect(errors).toEqual([]);
});
test('group fragments, cancel, reset and edit at different zooms',async({page})=>{
 await open(page,await fixture());await expect(page.locator('[data-native-region]')).toHaveCount(5);
 const region=page.getByRole('button',{name:'Edit existing text: Anand Joshi',exact:true}).first();
 for(let i=0;i<2;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await region.dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill('cancelled');await input.press('Escape');await expect(region).toHaveAttribute('aria-label','Edit existing text: Anand Joshi');
 await region.dblclick();await input.fill('Changed');await input.press('Control+Enter');
 const properties=page.getByRole('button',{name:'Properties',exact:true});if(await properties.isVisible())await properties.click();
 await page.getByRole('button',{name:'Reset to Original'}).click();await expect(region).toHaveAttribute('aria-label','Edit existing text: Anand Joshi');
});
test('deleting native text reconstructs colored background without ghosting',async({page})=>{
 await open(page,await fixture());await page.getByRole('button',{name:'Edit existing text: Anand Joshi',exact:true}).first().dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill('');await input.press('Control+Enter');
 const result=await inspect(page,await exportFile(page));
 // Area formerly occupied by the name must now be the blue cell background, not white or dark glyphs.
 for(let i=0;i<result.pixels.length;i+=4){expect(result.pixels[i]).toBeGreaterThan(200);expect(result.pixels[i+1]).toBeGreaterThan(225);expect(result.pixels[i+2]).toBeGreaterThan(240);}
});
test('Unicode replacement preserves characters through export',async({page})=>{
 await open(page,await fixture(0,'ગુજરાતી'));await page.locator('[data-native-region]').first().dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill('ગુજરાત');await input.press('Control+Enter');const result=await inspect(page,await exportFile(page));expect(result.items.map((i:{str:string})=>i.str).join('')).toContain('ગુજરાત');
});
test('existing text font size is presented to two decimals without changing the stored value',async({page})=>{
 await open(page,await precisionFixture());await page.getByRole('button',{name:'Edit existing text: Precision',exact:true}).dblclick();await expect(page.getByLabel('Existing text font size')).toHaveValue('18.92');await page.getByRole('textbox',{name:'Edit existing PDF text'}).press('Escape');
});
test('native replacements keep surrounding rendered content unchanged',async({page})=>{
 test.setTimeout(120000);const original=await fixture();await open(page,original);const before=await inspect(page,original.buffer);
 await page.getByRole('button',{name:'Edit existing text: SYSTEM',exact:true}).dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill('SYSTEM1');await input.press('Control+Enter');
 const after=await inspect(page,await exportFile(page));
 const a=PNG.sync.read(Buffer.from(before.image.split(',')[1],'base64')),b=PNG.sync.read(Buffer.from(after.image.split(',')[1],'base64'));
 let changedOutside=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  // The edited word is at PDF (320,590) with a 2x render. Permit only that text box.
  if(x>=580&&x<=820&&y>=330&&y<=470)continue;const offset=(y*a.width+x)*4;
  if(a.data[offset]!==b.data[offset]||a.data[offset+1]!==b.data[offset+1]||a.data[offset+2]!==b.data[offset+2]){changedOutside++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 }
 expect(changedOutside,`outside diff bounds: ${minX},${minY}–${maxX},${maxY}`).toBeLessThan(24);
});
for(const [label,from,to,unicode] of [
 ['longer','SYSTEM','SYSTEM1',''],['number','123456','987654',''],['shorter','Anand Joshi','AJ',''],['longer-name','Anand Joshi','Anand Kumar Sharma',''],['bold','Mathematics','Physics',''],['Gujarati','ગુજરાતી','ગુજરાત','ગુજરાતી'],['Hindi','Anand Joshi','हिंदी',''],
] as const)test(`native ${label} replacement preserves a text object`,async({page})=>{
 await open(page,await fixture(0,unicode));const target=unicode?page.locator('[data-native-region]').first():page.getByRole('button',{name:`Edit existing text: ${from}`,exact:true}).first();await target.dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill(to);await input.press('Control+Enter');const result=await inspect(page,await exportFile(page));expect(result.items.map((i:{str:string})=>i.str).join('')).toContain(to);
});
test('scanned and mixed pages distinguish image text from native text',async({page})=>{
 const doc=await PDFDocument.create(),png=new PNG({width:100,height:100});png.data.fill(180);const image=await doc.embedPng(PNG.sync.write(png));const p=doc.addPage();p.drawImage(image,{x:0,y:0,width:300,height:300});
 await stubLocalSpeedInsights(page);await page.goto('/edit-pdf');await page.getByLabel('Choose PDF',{exact:true}).setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(await doc.save())});await expect(page.getByText('This page appears to be scanned. Text recognition is required before existing text can be edited.')).toBeVisible({timeout:60000});await expect(page.locator('[data-native-region]')).toHaveCount(0);
});



test('hitboxes keep page coordinates at 50, 75, 100, 125, 150 percent and fit width',async({page})=>{
 await open(page,await fixture());const ratios=[];
 for(const zoom of [.5,.75,1,1.25,1.5,0]){
  await page.getByTitle('Fit page',{exact:true}).click();
  if(zoom===0)await page.getByTitle('Fit width',{exact:true}).click();
  else for(let i=0;i<Math.abs(zoom-1)/.25;i++)await page.getByRole('button',{name:zoom<1?'Zoom out':'Zoom in',exact:true}).click();
  await waitForEditorLayout(page);
  ratios.push(await page.evaluate(()=>{
   const paper=document.querySelector('[data-testid="pdf-canvas"]')!.getBoundingClientRect(),region=document.querySelector('[data-native-region]')!.getBoundingClientRect();
   return [(region.x-paper.x)/paper.width,(region.y-paper.y)/paper.height,region.width/paper.width];
  }));
 }
 for(const ratio of ratios)for(let i=0;i<3;i++)expect(ratio[i]).toBeCloseTo(ratios[0][i],3);
});
test('mixed native and image page exposes only genuine text regions',async({page})=>{
 const file=await fixture(),doc=await PDFDocument.load(file.buffer),png=new PNG({width:100,height:100});png.data.fill(160);const image=await doc.embedPng(PNG.sync.write(png));doc.getPage(0).drawImage(image,{x:100,y:100,width:100,height:100});
  await open(page,{...file,buffer:Buffer.from(await doc.save())});await expect(page.getByText('Double-click existing text to edit. Text inside images is not directly editable.')).toBeVisible();await expect(page.locator('[data-native-region]')).toHaveCount(5);
});
test('Devanagari and mixed-script replacement retain logical Unicode text',async({page},info)=>{
 test.setTimeout(120000);
 for(const replacement of ['हिंदी','ગુજરાત English 123']){
  await open(page,await fixture());await page.locator('[data-native-region]').first().dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill(replacement);await input.press('Control+Enter');await expect(input).toHaveCount(0,{timeout:20000});
  const bytes=await exportFile(page),result=await inspect(page,bytes);await fs.writeFile(info.outputPath(replacement==='हिंदी'?'hindi.pdf':'mixed.pdf'),bytes);await fs.writeFile(info.outputPath(replacement==='हिंदी'?'hindi.png':'mixed.png'),Buffer.from(result.image.split(',')[1],'base64'));
  expect(result.items.map((i:{str:string})=>i.str).join('')).toContain(replacement);
 }
});


test('crop boxes, UserUnit and rotated native text preserve PDF transforms',async({page})=>{
 const file=await fixture(),doc=await PDFDocument.load(file.buffer),p=doc.getPage(0),font=await doc.embedFont(StandardFonts.Helvetica);
 const {PDFName,PDFNumber}=await import('pdf-lib');p.setCropBox(40,80,530,660);p.node.set(PDFName.of('UserUnit'),PDFNumber.of(1.25));p.setRotation(degrees(90));p.drawText('Rotated',{x:340,y:450,font,size:12,rotate:degrees(30)});
 await open(page,{...file,buffer:Buffer.from(await doc.save())});await page.getByRole('button',{name:'Edit existing text: Rotated',exact:true}).dblclick();const input=page.getByRole('textbox',{name:'Edit existing PDF text'});await input.fill('Revised');await input.press('Control+Enter');const result=await inspect(page,await exportFile(page));const item=result.items.find((i:{str:string;transform:number[]})=>i.str==='Revised');expect(item).toBeTruthy();expect(item.transform[4]).toBeCloseTo(340,1);expect(item.transform[5]).toBeCloseTo(450,1);expect(Math.atan2(item.transform[1],item.transform[0])*180/Math.PI).toBeCloseTo(30,1);
});
