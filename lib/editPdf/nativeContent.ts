import { PDFArray, PDFName, PDFRawStream, decodePDFRawStream, type PDFPage } from 'pdf-lib';
import type { ExistingTextEdit } from './nativeText';

type Span = { start: number; end: number };
const encoder = new TextEncoder(), decoder = new TextDecoder('latin1');
const white = (byte:number) => byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
const delimiter = (byte:number) => white(byte) || '()<>[]{}/%'.includes(String.fromCharCode(byte));

function stringEnd(bytes:Uint8Array,start:number) {
 let depth=1,escaped=false;
 for(let i=start+1;i<bytes.length;i++){
  if(escaped){escaped=false;continue;} if(bytes[i]===92){escaped=true;continue;}
  if(bytes[i]===40)depth++; else if(bytes[i]===41&&!--depth)return i+1;
 }
 return -1;
}
function hexEnd(bytes:Uint8Array,start:number) { for(let i=start+1;i<bytes.length;i++)if(bytes[i]===62)return i+1;return -1; }
function arrayEnd(bytes:Uint8Array,start:number) {
 let depth=1;
 for(let i=start+1;i<bytes.length;){
  const b=bytes[i];if(b===37){while(i<bytes.length&&bytes[i]!==10&&bytes[i]!==13)i++;continue;}
  if(b===40){i=stringEnd(bytes,i);if(i<0)return -1;continue;} if(b===60&&bytes[i+1]!==60){i=hexEnd(bytes,i);if(i<0)return -1;continue;}
  if(b===91)depth++;else if(b===93&&!--depth)return i+1;i++;
 }
 return -1;
}
function dictEnd(bytes:Uint8Array,start:number) {
 for(let i=start+2;i<bytes.length;i++)if(bytes[i]===62&&bytes[i+1]===62)return i+2;
 return -1;
}
/** Returns complete operands + operator spans for text-showing operators only. */
function textShowSpans(bytes:Uint8Array):Span[] {
 const spans:Span[]=[];let operandStart=-1,i=0;
 while(i<bytes.length){
  while(i<bytes.length&&white(bytes[i]))i++;
  if(bytes[i]===37){while(i<bytes.length&&bytes[i]!==10&&bytes[i]!==13)i++;continue;}
  if(i>=bytes.length)break;const start=i,b=bytes[i];let end=-1;
  if(b===40)end=stringEnd(bytes,i);else if(b===91)end=arrayEnd(bytes,i);else if(b===60&&bytes[i+1]===60)end=dictEnd(bytes,i);else if(b===60)end=hexEnd(bytes,i);
  else if(b===47){i++;while(i<bytes.length&&!delimiter(bytes[i]))i++;end=i;}
  else {while(i<bytes.length&&!delimiter(bytes[i]))i++;end=i;}
  if(end<0)throw new Error('Unsupported PDF content string.');
  const token=decoder.decode(bytes.subarray(start,end));
  if(operandStart<0)operandStart=start;
  if(token==='Tj'||token==='TJ'||token==='\''||token==='"'){spans.push({start:operandStart,end});operandStart=-1;}
  else if(token==='BT'||token==='ET'||token==='Tf'||token==='Tm'||token==='Td'||token==='TD'||token==='T*'||token==='Tc'||token==='Tw'||token==='Tz'||token==='TL'||token==='Ts'||token==='Tr'||token==='q'||token==='Q')operandStart=-1;
  i=end;
 }
 return spans;
}
function streamEntries(page:PDFPage) {
 const contents=page.node.get(PDFName.of('Contents')),context=page.doc.context;
 if(contents instanceof PDFArray)return contents.asArray().map((entry,index)=>({
  stream:context.lookup(entry) as PDFRawStream,replace:(next:Uint8Array)=>contents.set(index,context.register(context.flateStream(next))),
 }));
 const stream=context.lookup(contents) as PDFRawStream;
 return [{stream,replace:(next:Uint8Array)=>page.node.set(PDFName.of('Contents'),context.register(context.flateStream(next)))}];
}

/**
 * Makes only the original show-text operators invisible. The original bytes still
 * advance the text matrix, so later text in the same BT/ET block is unaffected.
 * This deliberately avoids a raster or whiteout cover.
 */
export function hideEditedNativeText(page:PDFPage,edits:ExistingTextEdit[]) {
 const required=[...new Set(edits.flatMap(edit=>edit.sourceTextOperators))];
 if(!required.length)return false;
 const entries=streamEntries(page),located:{entry:number;span:Span}[]=[];
 for(const [entryIndex,entry] of entries.entries())for(const span of textShowSpans(decodePDFRawStream(entry.stream).decode()))located.push({entry:entryIndex,span});
 if(required.some(index=>index<0||index>=located.length))return false;
 const selected=new Set(required);
 for(const [entryIndex,entry] of entries.entries()){
  const bytes=decodePDFRawStream(entry.stream).decode(),replacements=located.map((item,index)=>({...item,index})).filter(item=>item.entry===entryIndex&&selected.has(item.index)).sort((a,b)=>b.span.start-a.span.start);
  if(!replacements.length)continue;
  let source=decoder.decode(bytes);
  for(const item of replacements){const old=source.slice(item.span.start,item.span.end);source=source.slice(0,item.span.start)+`q 3 Tr ${old} Q`+source.slice(item.span.end);}
  entry.replace(encoder.encode(source));
 }
 return true;
}
