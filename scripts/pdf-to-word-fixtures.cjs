const { chromium } = require('@playwright/test');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const dir = path.resolve('tmp/pdf-word-general/fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<html><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font:16px Arial}p{margin:20px 0}table{border-collapse:collapse;width:100%}td{border:1px solid #345;padding:10px}</style>
  <p>Mixed scripts and unchanged numbers 2048 19.75</p>
  <p dir="rtl">مرحبا بالعالم — رقم الطلب 12345</p><p dir="rtl">שלום עולם 6789</p>
  <p>中文测试 日本語テスト 한국어 테스트</p><p>ગુજરાતી ભાષા અને हिंदी भाषा</p>
  <table><tr><td>Item</td><td>Quantity</td><td>Price</td></tr><tr><td>Editable cell</td><td>12</td><td>19.75</td></tr></table></html>`);
  await page.pdf({path:path.join(dir,'rtl-cjk.pdf'),printBackground:true,preferCSSPageSize:true});
  const scan = await PDFDocument.load(fs.readFileSync('test-results/pdf-to-word/fixtures/scanned-english.pdf'));
  const mixed = await PDFDocument.create();
  const embedded = await mixed.embedPage(scan.getPage(0));
  const mixedPage=mixed.addPage([612,792]);
  const font=await mixed.embedFont(StandardFonts.Helvetica);
  mixedPage.drawText('Reliable native heading 123', {x:40,y:750,size:16,font});
  mixedPage.drawPage(embedded,{x:40,y:60,width:532,height:640});
  fs.writeFileSync(path.join(dir,'mixed-native-scan.pdf'),await mixed.save());
  await page.setContent(`<style>@page{size:A4;margin:15mm}body{font:11px Arial}table{border-collapse:collapse;width:100%}td{border:1px solid #246;padding:3px}</style><h2>Dense table and page flow</h2><table>${Array.from({length:35},(_,i)=>`<tr><td>Record ${i+1}</td><td>Value ${100+i}</td><td>Notes ${i+1}</td></tr>`).join('')}</table>`);
  await page.pdf({path:path.join(dir,'dense-table.pdf'),printBackground:true,preferCSSPageSize:true});
  await browser.close();
})();
