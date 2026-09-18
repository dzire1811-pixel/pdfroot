import type { PdfSource } from './model';
import { loadPdfJs } from '@/lib/pdfjsClient';
/** The export font source; this is deliberately more precise than the UI label. */
export type FontMatch = 'embedded' | 'substituted-pdf' | 'fallback' | 'unavailable';
export type NativeRegion = {
  id: string; pageIndex: number; originalText: string; x: number; y: number; width: number; height: number;
  baseline: number; fontSize: number; fontName: string; family: string; bold: boolean; italic: boolean;
  originalBold?: boolean; originalItalic?: boolean; rotation: number; direction: string; color: string; transform: number[]; sourceTextItems: number[];
  /** Original PDF text state, retained independently from the display controls. */
  sourceTextOperators: number[]; horizontalScale: number; characterSpacing: number; wordSpacing: number; leading: number;
};
export type ExistingTextEdit = NativeRegion & { newText: string; fontMatch: FontMatch; resolvedFont: string; align: 'left' | 'center' | 'right'; changed: boolean };
export type NativePage = { type: 'native' | 'mixed' | 'scanned' | 'outlines' | 'empty'; regions: NativeRegion[]; width: number; height: number; background: HTMLCanvasElement };
export function pageMatrix(rotation: number, width: number, height: number) {
  return rotation === 90 ? `matrix(0 1 -1 0 ${height} 0)` : rotation === 180 ? `matrix(-1 0 0 -1 ${width} ${height})` : rotation === 270 ? `matrix(0 -1 1 0 0 ${width})` : '';
}
export function beginTextEdit(region: NativeRegion): ExistingTextEdit {
  return { ...region, newText: region.originalText, fontMatch: 'unavailable', resolvedFont: 'auto', align: region.direction === 'rtl' ? 'right' : 'left', changed: false };
}
// Conservative line grouping: same baseline, font and orientation, and only a small inter-item gap.
// Deliberately stop at label separators and large gaps (table cells / columns).
export function groupTextRegions(items: NativeRegion[]) {
  const regions: NativeRegion[] = [];
  for (const item of items) {
    const previous = regions.at(-1), angle = item.rotation * Math.PI / 180;
    const dx = previous ? item.x - previous.x : 0, dy = previous ? item.y - previous.y : 0;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle), across = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const gap = previous ? along - previous.width : Infinity;
    if (previous && item.direction !== 'rtl' && previous.fontName === item.fontName && previous.color === item.color && Math.abs(previous.fontSize-item.fontSize)<.15 && Math.abs(previous.rotation-item.rotation)<.1 && Math.abs(across)<item.fontSize*.12 && gap>-.5 && gap<item.fontSize*.45 && !/[:：]\s*$/.test(previous.originalText)) {
      previous.originalText += gap > item.fontSize*.12 && !/\s$/.test(previous.originalText) && !/^\s/.test(item.originalText) ? ' '+item.originalText : item.originalText;
      previous.width = along+item.width; previous.sourceTextItems.push(...item.sourceTextItems); previous.sourceTextOperators.push(...item.sourceTextOperators);
    } else regions.push({...item,sourceTextItems:[...item.sourceTextItems],sourceTextOperators:[...item.sourceTextOperators]});
  }
  return regions;
}
export function analyzeNativePage(source: PdfSource, index: number): Promise<NativePage> {
  source.nativePages ??= new Map();
  const cached = source.nativePages.get(index); if(cached)return cached;
  if(source.nativePages.size>=2)source.nativePages.delete(source.nativePages.keys().next().value!);
  const pending = analyze(source,index); source.nativePages.set(index,pending);
  pending.catch(()=>source.nativePages?.delete(index)); return pending;
}
// Classify the document progressively without rasterizing off-screen pages or blocking upload.
export async function classifyNativePages(source: PdfSource) {
  source.pageTypes = new Map();
  try {
    const { OPS } = await loadPdfJs();
    for (let index = 0; index < source.pdf.numPages && !source.disposed; index++) {
      const page = await source.pdf.getPage(index + 1);
      const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      const text = content.items.some(item => 'str' in item && item.str.trim());
      const image = operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op));
      source.pageTypes.set(index, text ? image ? 'mixed' : 'native' : image ? 'scanned' : operators.fnArray.includes(OPS.constructPath) ? 'outlines' : 'empty');
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch { /* Closing a document cancels background classification. Active-page analysis reports failures. */ }
}
async function analyze(source: PdfSource, index: number): Promise<NativePage> {
  const pdfjs = await loadPdfJs(), page = await source.pdf.getPage(index+1);
  const viewport = page.getViewport({scale:1,rotation:0});
  const [text,ops] = await Promise.all([page.getTextContent(),page.getOperatorList()]);
  if(ops.fnArray.some((op,i)=>op===pdfjs.OPS.setTextRenderingMode&&Number(ops.argsArray[i]?.[0])>=4))throw new Error('Text clipping needs advanced content-stream editing.');
  const textOps = new Set([pdfjs.OPS.showText,pdfjs.OPS.showSpacedText,pdfjs.OPS.nextLineShowText,pdfjs.OPS.nextLineSetSpacingShowText]);
  // PDF.js already resolves the page content stream. Preserve its text-state values rather
  // than trying to infer them from browser CSS or from the rendered bounding box.
  const textState: { horizontalScale: number; characterSpacing: number; wordSpacing: number; leading: number; color?: string } = { horizontalScale: 1, characterSpacing: 0, wordSpacing: 0, leading: 0 };
  const showOperators: { index: number; text: string; horizontalScale: number; characterSpacing: number; wordSpacing: number; leading: number; color?: string }[] = [];
  const toHex=(value:number)=>Math.round(Math.max(0,Math.min(1,value))*255).toString(16).padStart(2,'0');
  for (const [operatorIndex, op] of ops.fnArray.entries()) {
    const args = ops.argsArray[operatorIndex] ?? [];
    if (op === pdfjs.OPS.setHScale) textState.horizontalScale = Number(args[0]) / 100 || 1;
    else if (op === pdfjs.OPS.setCharSpacing) textState.characterSpacing = Number(args[0]) || 0;
    else if (op === pdfjs.OPS.setWordSpacing) textState.wordSpacing = Number(args[0]) || 0;
    else if (op === pdfjs.OPS.setLeading) textState.leading = Number(args[0]) || 0;
    else if (op === pdfjs.OPS.setFillRGBColor) textState.color=`#${toHex(Number(args[0]))}${toHex(Number(args[1]))}${toHex(Number(args[2]))}`;
    // The ordinal is stable across PDF.js text extraction and the content-stream
    // scanner used at export; the raw PDF operator index is not.
    if (textOps.has(op)) {
      const collect=(value:unknown):string=>Array.isArray(value)?value.map(collect).join(''):typeof value==='string'?value:value&&typeof value==='object'&&'unicode' in value?String((value as {unicode?:unknown}).unicode??''):'';
      showOperators.push({ index: showOperators.length, text:collect(args), ...textState });
    }
  }
  // TextContent items and raw show operators are not guaranteed to share an index:
  // PDF.js can merge or split spans. Match their decoded text in reading order so a
  // replacement can never accidentally suppress a neighbouring operator.
  const matchedShowOperators=new Map<number,(typeof showOperators)[number]>();let showCursor=0;
  for(const [itemIndex,item] of text.items.entries())if('str' in item&&item.str.trim()){
    const normalized=item.str.replace(/\s+/gu,' '),match=showOperators.findIndex((candidate,candidateIndex)=>candidateIndex>=showCursor&&candidate.text.replace(/\s+/gu,' ')===normalized);
    if(match>=0){matchedShowOperators.set(itemIndex,showOperators[match]);showCursor=match+1;}
  }
  const scale = Math.min(3,Math.sqrt(12_000_000/(viewport.width*viewport.height)));
  const background = document.createElement('canvas'); background.width=Math.ceil(viewport.width*scale);background.height=Math.ceil(viewport.height*scale);
  // Retain fills, images and table rules; omit text drawing only. This is a local patch source, never a replacement for the whole PDF page.
  await page.render({canvas:background,viewport:page.getViewport({scale,rotation:0}),operationsFilter:i=>!textOps.has(ops.fnArray[i])}).promise;
  const regions: NativeRegion[]=[];
  for(const [itemIndex,item] of text.items.entries()) {
    if(!('str' in item)||!item.str.trim())continue;
    const style=text.styles[item.fontName], t=pdfjs.Util.transform(viewport.transform,item.transform);
    const fontSize=Math.hypot(t[2],t[3]); if(!fontSize)continue;
    let metadata: {name?:string; fontFamily?:string; bold?:boolean; italic?:boolean; cssFontInfo?:{fontFamily?:string}}={};
    try{metadata=page.commonObjs.get(item.fontName)??{};}catch{}
    const rotation=Math.atan2(t[1],t[0])*180/Math.PI, ascent=(style.ascent??.8)*fontSize;
    const a=rotation*Math.PI/180;
    const state = matchedShowOperators.get(itemIndex) ?? { index: -1, ...textState };
    regions.push({id:`native-${index}-${itemIndex}`,pageIndex:index,originalText:item.str,x:t[4]+Math.sin(a)*ascent,y:t[5]-Math.cos(a)*ascent,width:item.width*Math.hypot(viewport.transform[0],viewport.transform[1]),height:fontSize*1.15,baseline:ascent,fontSize,fontName:metadata.name??item.fontName,family:metadata.cssFontInfo?.fontFamily||style.fontFamily||metadata.fontFamily||'sans-serif',bold:!!metadata.bold||/bold|black|demi/i.test(metadata.name??''),italic:!!metadata.italic||/italic|oblique/i.test(metadata.name??''),rotation,direction:item.dir,color:state.color??'',transform:[...item.transform],sourceTextItems:[itemIndex],sourceTextOperators:state.index < 0 ? [] : [state.index],horizontalScale:state.horizontalScale,characterSpacing:state.characterSpacing,wordSpacing:state.wordSpacing,leading:state.leading});
  }
  // Color comes from the rendered text pixels compared against the reconstructed background.
  const painted=document.createElement('canvas');painted.width=background.width;painted.height=background.height;
  await page.render({canvas:painted,viewport:page.getViewport({scale,rotation:0})}).promise;
  const ctx=painted.getContext('2d')!,bg=background.getContext('2d')!;
  const pixels=ctx.getImageData(0,0,painted.width,painted.height).data,backgroundPixels=bg.getImageData(0,0,painted.width,painted.height).data;
  for(const r of regions){
    const a=r.rotation*Math.PI/180, colors=new Map<string,number>();
    for(let u=0;u<r.width;u+=Math.max(.5,r.width/150))for(let v=0;v<r.height;v+=.5){
      const x=Math.floor((r.x+u*Math.cos(a)-v*Math.sin(a))*scale),y=Math.floor((r.y+u*Math.sin(a)+v*Math.cos(a))*scale);
      if(x<0||y<0||x>=painted.width||y>=painted.height)continue;
      const offset=(y*painted.width+x)*4,p=pixels.subarray(offset,offset+4),b=backgroundPixels.subarray(offset,offset+4);
      if(Math.abs(p[0]-b[0])+Math.abs(p[1]-b[1])+Math.abs(p[2]-b[2])<80)continue;
      const hex='#'+[p[0],p[1],p[2]].map(c=>c.toString(16).padStart(2,'0')).join('');colors.set(hex,(colors.get(hex)??0)+1);
    }
    r.color ||= [...colors].sort((a,b)=>b[1]-a[1])[0]?.[0]??'';
  }
  painted.width=painted.height=0;
  const visibleRegions=regions.filter(r=>r.color);
  const imageOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject]);
  const hasImage=ops.fnArray.some(op=>imageOps.has(op)),hasPath=ops.fnArray.includes(pdfjs.OPS.constructPath);
  return {type:visibleRegions.length?(hasImage?'mixed':'native'):hasImage?'scanned':hasPath?'outlines':'empty',regions:groupTextRegions(visibleRegions.map(r=>({...r,originalBold:r.bold,originalItalic:r.italic}))),width:viewport.width,height:viewport.height,background};
}
export function patchForRegion(native: NativePage,r:NativeRegion) {
  const scale=native.background.width/native.width,pad=.8;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil((r.width+pad*2)*scale);canvas.height=Math.ceil((r.height+pad*2)*scale);
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.scale(scale,scale);ctx.translate(pad,pad);ctx.rotate(-r.rotation*Math.PI/180);ctx.translate(-r.x,-r.y);ctx.drawImage(native.background,0,0,native.width,native.height);
  const data=canvas.toDataURL('image/png');canvas.width=canvas.height=0;return {data,pad};
}
