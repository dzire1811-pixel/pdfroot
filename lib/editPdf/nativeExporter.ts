import { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix, type PDFPage } from 'pdf-lib';
import type { EditorPage, PdfSource } from './model';
import { analyzeNativePage, patchForRegion } from './nativeText';
import { resolveNativeFont, drawResolvedText, nativeTextWidth, finalizeNativeFonts } from './nativeFonts';
import { hideEditedNativeText } from './nativeContent';
export async function exportNativeEdits(result:PDFDocument,target:PDFPage,model:EditorPage,source:PdfSource){
 const edits=model.existingTextEdits?.filter(edit=>edit.changed)??[];
 if(!edits.length)return;
 const native=await analyzeNativePage(source,model.sourceIndex),overlayDoc=await PDFDocument.create(),overlay=overlayDoc.addPage([native.width,native.height]);
 // Prefer true content-stream edits: the original glyph show operators are made
 // invisible while keeping their text-matrix advance, and the replacement remains
 // native PDF text. Raster patches are reserved for malformed/unsupported streams.
 const streamEdited=hideEditedNativeText(target,edits);
 for(const edit of edits){
  const original=native.regions.find(r=>r.id===edit.id);if(!original)throw new Error('Existing text changed unexpectedly. Reopen this PDF before exporting.');
  const resolved=await resolveNativeFont(overlayDoc,source,edit);
  const transform=(x:number,y:number,rotation:number)=>{const a=-rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);overlay.pushOperators(pushGraphicsState(),concatTransformationMatrix(c,s,-s,c,x,native.height-y));};
  if(!streamEdited){
   // A separate explicit compatibility fallback for PDFs with a content stream we
   // cannot safely rewrite. This is not used when native text editing is possible.
   const patch=patchForRegion(native,original),image=await overlayDoc.embedPng(patch.data);
   transform(original.x,original.y,original.rotation);
   overlay.drawImage(image,{x:-patch.pad,y:-original.height-patch.pad,width:original.width+2*patch.pad,height:original.height+2*patch.pad});overlay.pushOperators(popGraphicsState());
  }
  if(!edit.newText)continue;
  transform(edit.x,edit.y,edit.rotation);
  const width=nativeTextWidth(edit,resolved),x=edit.align==='center'?(edit.width-width)/2:edit.align==='right'?edit.width-width:0;
  drawResolvedText(overlay,resolved,edit,x,-edit.baseline);
  overlay.pushOperators(popGraphicsState());
 }
 // Deletion-only native edits already changed the target stream; there is no
 // overlay content to embed, and pdf-lib rejects pages without Contents.
 if(streamEdited&&edits.every(edit=>!edit.newText))return;
 await finalizeNativeFonts(overlayDoc);const embedded=await result.embedPage(overlay);
 const original=await source.pdf.getPage(model.sourceIndex+1),[a,b,c,d,e,f]=original.getViewport({scale:1,rotation:0}).transform,det=a*d-b*c;
 const inv=[d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
 target.pushOperators(pushGraphicsState(),concatTransformationMatrix(inv[0],inv[1],-inv[2],-inv[3],inv[2]*native.height+inv[4],inv[3]*native.height+inv[5]));
 target.drawPage(embedded,{x:0,y:0,width:native.width,height:native.height});target.pushOperators(popGraphicsState());
}
