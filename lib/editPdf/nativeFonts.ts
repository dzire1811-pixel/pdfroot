import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRawStream, decodePDFRawStream, type PDFFont, type PDFPage, PDFHexString, beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingRgbColor, setCharacterSpacing, setWordSpacing, setCharacterSqueeze, setLineHeight, PDFOperator } from 'pdf-lib';
import type { PdfSource } from './model';
import type { ExistingTextEdit, FontMatch } from './nativeText';
export type ResolvedNativeFont = { font: PDFFont; family: string; status: FontMatch; key: string; bytes?: Uint8Array; runs?: { text: string; resolved: ResolvedNativeFont }[] };
const fallbackFiles = ['noto-sans-latin','noto-sans-devanagari-devanagari','noto-sans-gujarati-gujarati','noto-sans-greek','noto-sans-cyrillic','noto-sans-vietnamese'];
const bytesCache = new Map<string,Promise<Uint8Array>>();
const documentCache = new WeakMap<PdfSource,Promise<PDFDocument>>();
const cssCache = new WeakMap<PdfSource,Map<string,Promise<string>>>();
const faces = new WeakMap<PdfSource,Set<FontFace>>();
const released = new WeakSet<PdfSource>();
let faceId=0;
const unicodeMaps=new WeakMap<PDFDocument,Map<PDFFont,Map<number,string>>>();
const clean = (s:string)=>s.replace(/^[A-Z]{6}\+/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
function standardName(edit:ExistingTextEdit) {
 const name=edit.resolvedFont==='auto'?edit.fontName+' '+edit.family:edit.resolvedFont;
 const family=/times|serif/i.test(name)&&!/sans/i.test(name)?'Times':/courier|mono/i.test(name)?'Courier':'Helvetica';
 return family==='Times' ? edit.bold?(edit.italic?'Times-BoldItalic':'Times-Bold'):(edit.italic?'Times-Italic':'Times-Roman') : family+(edit.bold?(edit.italic?'-BoldOblique':'-Bold'):(edit.italic?'-Oblique':''));
}
async function sourceFont(source:PdfSource,name:string) {
 let pending=documentCache.get(source);if(!pending){pending=PDFDocument.load(source.bytes);documentCache.set(source,pending);}
 const doc=await pending;
 for(const [,value] of doc.context.enumerateIndirectObjects()){
  if(!(value instanceof PDFDict))continue;
  const base=value.get(PDFName.of('BaseFont'));if(!base||clean(base.toString().slice(1))!==clean(name))continue;
  let font=value;const descendants=font.lookupMaybe(PDFName.of('DescendantFonts'),PDFArray);if(descendants)font=descendants.lookup(0,PDFDict);
  const descriptor=font.lookupMaybe(PDFName.of('FontDescriptor'),PDFDict);if(!descriptor)continue;
  for(const key of ['FontFile','FontFile2','FontFile3']){const ref=descriptor.get(PDFName.of(key));const stream=ref?doc.context.lookup(ref):undefined;if(stream instanceof PDFRawStream)return decodePDFRawStream(stream).decode();}
 }
}
function supports(bytes:Uint8Array,text:string){
 try{const font=fontkit.create(bytes);const embedding=(font as unknown as {'OS/2'?:{fsType?:{noEmbedding?:boolean;bitmapOnly?:boolean;viewOnly?:boolean;editable?:boolean}}})['OS/2']?.fsType;if(embedding?.noEmbedding||embedding?.bitmapOnly||(embedding?.viewOnly&&!embedding?.editable))return false;return [...text].filter(c=>!/[\s\u200c\u200d]/u.test(c)).every(c=>font.hasGlyphForCodePoint(c.codePointAt(0)!));}catch{return false;}
}
async function cssFont(source:PdfSource,key:string,bytes:Uint8Array){
 let cache=cssCache.get(source);if(!cache){cache=new Map();cssCache.set(source,cache);}

 let pending=cache.get(key);if(!pending){pending=(async()=>{const family='native_font_'+(++faceId);const face=new FontFace(family,new Uint8Array(bytes).buffer);await face.load();if(!released.has(source)){document.fonts.add(face);let set=faces.get(source);if(!set){set=new Set();faces.set(source,set);}set.add(face);}return family;})();cache.set(key,pending);}return pending;
}
export async function resolveNativeFont(doc:PDFDocument,source:PdfSource,edit:ExistingTextEdit,allowRuns=true):Promise<ResolvedNativeFont>{
 doc.registerFontkit(fontkit);
 if(edit.resolvedFont==='auto' && edit.bold===(edit.originalBold??/bold|black|demi/i.test(edit.fontName)) && edit.italic===(edit.originalItalic??/italic|oblique/i.test(edit.fontName))){
  const bytes=await sourceFont(source,edit.fontName);
  if(bytes&&supports(bytes,edit.newText)){
   try{return {font:await doc.embedFont(bytes,{subset:false}),family:await cssFont(source,edit.fontName,bytes),status:'embedded',key:edit.fontName,bytes};}catch{/* Unsupported embedded font format: use a verified compatible font. */}
  }
 }
 const name=standardName(edit),font=await doc.embedFont(name);
 try{font.encodeText(edit.newText);return {font,family:name.startsWith('Times')?'Times New Roman':name.startsWith('Courier')?'Courier New':'Arial',status:'substituted-pdf',key:name};}catch{}
 for(const file of fallbackFiles){
  let pending=bytesCache.get(file);if(!pending){pending=fetch(`/fonts/edit-pdf/${file}-400-normal.ttf`).then(async r=>{if(!r.ok)throw new Error('Font unavailable');return new Uint8Array(await r.arrayBuffer());});bytesCache.set(file,pending);}
  const bytes=await pending;if(!supports(bytes,edit.newText))continue;
  return {font:await doc.embedFont(bytes,{subset:false}),family:await cssFont(source,file,bytes),status:'fallback',key:file,bytes};
 }

 if(allowRuns){
  const segments=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(edit.newText),s=>s.segment);
  const runs:{text:string;resolved:ResolvedNativeFont}[]=[];
  for(const segment of segments){
   const resolved=await resolveNativeFont(doc,source,{...edit,newText:segment},false);
   const last=runs.at(-1);if(last?.resolved.key===resolved.key)last.text+=segment;else runs.push({text:segment,resolved});
  }
  if(runs.length)return {font:runs[0].resolved.font,family:[...new Set(runs.map(r=>r.resolved.family))].join(','),status:'fallback',key:'mixed',runs};
 }
 throw new Error('A compatible font for this text is not available. Try another font or keep the original text.');
}
export function nativeTextWidth(edit:ExistingTextEdit,resolved:ResolvedNativeFont):number{
 return resolved.runs ? resolved.runs.reduce((sum,r)=>sum+nativeTextWidth({...edit,newText:r.text},r.resolved),0) : resolved.font.widthOfTextAtSize(edit.newText,edit.fontSize);
}

// Custom fonts use the shaper's glyph advances AND offsets. pdf-lib drawText alone omits
// positioning offsets needed by combining marks and many Indic conjuncts.
export function drawResolvedText(page:PDFPage,resolved:ResolvedNativeFont,edit:ExistingTextEdit,x:number,y:number){
 if(resolved.runs){let cursor=x;for(const run of resolved.runs){const part={...edit,newText:run.text};drawResolvedText(page,run.resolved,part,cursor,y);cursor+=nativeTextWidth(part,run.resolved);}return;}
 const hex=edit.color,r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
 const characterSpacing=edit.characterSpacing??0,wordSpacing=edit.wordSpacing??0,horizontalScale=(edit.horizontalScale??1)*100,leading=edit.leading??0;
 const operators=[beginText(),setFontAndSize(page.node.newFontDictionary(resolved.font.name,resolved.font.ref),edit.fontSize),setCharacterSpacing(characterSpacing),setWordSpacing(wordSpacing),setCharacterSqueeze(horizontalScale),setLineHeight(leading),setFillingRgbColor(r,g,b),setTextMatrix(1,0,0,1,x,y)];
 if(!resolved.bytes){operators.push(showText(resolved.font.encodeText(edit.newText)),endText());page.pushOperators(...operators);return;}
 resolved.font.encodeText(edit.newText);
 const font=fontkit.create(resolved.bytes),run=font.layout(edit.newText),scale=edit.fontSize/font.unitsPerEm;
 const key=page.node.newFontDictionary(resolved.font.name,resolved.font.ref);

 let maps=unicodeMaps.get(page.doc);if(!maps){maps=new Map();unicodeMaps.set(page.doc,maps);}
 let mapping=maps.get(resolved.font);if(!mapping){mapping=new Map();for(const code of font.characterSet)mapping.set(font.glyphForCodePoint(code).id,String.fromCodePoint(code));maps.set(resolved.font,mapping);}
 let cursorX=x,cursorY=y;
 const occurrences=new Map<string,number>();
 const draws=run.glyphs.map((glyph,i)=>{
  const position=run.positions[i],text=String.fromCodePoint(...glyph.codePoints);
  mapping!.set(glyph.id,text);
  const found=edit.newText.indexOf(text,occurrences.get(text)??0);if(found>=0)occurrences.set(text,found+text.length);
  const draw={id:glyph.id,x:cursorX+position.xOffset*scale,y:cursorY+position.yOffset*scale,order:found<0?i:found};
  cursorX+=position.xAdvance*scale;cursorY+=position.yAdvance*scale;return draw;
 });
 // Emit in logical Unicode order while retaining the shaper's visual glyph positions.
 page.pushOperators(PDFOperator.of('BDC' as never,[PDFName.of('Span'),page.doc.context.obj({ActualText:PDFHexString.fromText(edit.newText)}).toString()]),beginText(),setFontAndSize(key,edit.fontSize),setCharacterSpacing(characterSpacing),setWordSpacing(wordSpacing),setCharacterSqueeze(horizontalScale),setLineHeight(leading),setFillingRgbColor(r,g,b));
 for(const glyph of draws.sort((a,b)=>a.order-b.order))page.pushOperators(setTextMatrix(1,0,0,1,glyph.x,glyph.y),showText(PDFHexString.of(glyph.id.toString(16).padStart(4,'0'))));

 page.pushOperators(endText(),PDFOperator.of('EMC' as never));
}

export function releaseNativeResources(source:PdfSource){
 source.disposed=true;
 released.add(source);for(const face of faces.get(source)??[])document.fonts.delete(face);
 faces.delete(source);cssCache.delete(source);source.nativePages?.clear();
}


export async function finalizeNativeFonts(doc:PDFDocument){
 await doc.flush();
 for(const [font,map] of unicodeMaps.get(doc)??[]){
  const entries=[...map].map(([id,text])=>`<${id.toString(16).padStart(4,'0')}> <${PDFHexString.fromText(text).asString().slice(4)}>`);
  const chunks=[];for(let i=0;i<entries.length;i+=100){const chunk=entries.slice(i,i+100);chunks.push(`${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`);}
  const cmap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /NativeUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  doc.context.lookup(font.ref,PDFDict).set(PDFName.of('ToUnicode'),doc.context.register(doc.context.flateStream(cmap)));
 }
}

