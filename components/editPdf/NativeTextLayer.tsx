import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import type { PdfSource } from '@/lib/editPdf/model';
import { beginTextEdit, pageMatrix, patchForRegion, type ExistingTextEdit, type NativePage, type NativeRegion } from '@/lib/editPdf/nativeText';
import { resolveNativeFont, nativeTextWidth } from '@/lib/editPdf/nativeFonts';
import styles from './EditPdf.module.css';

function Replacement({edit,source}:{edit:ExistingTextEdit;source:PdfSource}){
 const [family,setFamily]=useState(edit.family);
 useEffect(()=>{let active=true;void PDFDocument.create().then(doc=>resolveNativeFont(doc,source,edit)).then(r=>{if(active)setFamily(r.family);}).catch(()=>{});return()=>{active=false;};},[source,edit]);
 return <text x={edit.align==='center'?edit.width/2:edit.align==='right'?edit.width:0} y={edit.baseline} textAnchor={edit.align==='center'?'middle':edit.align==='right'?'end':'start'} fontFamily={family} fontSize={edit.fontSize} fontWeight={edit.bold?'bold':'normal'} fontStyle={edit.italic?'italic':'normal'} fill={edit.color} direction={edit.direction} style={{whiteSpace:'pre'}}>{edit.newText}</text>;
}
export function NativeTextLayer({native,source,edits,rotation,enabled,selected,select,commit,draftChanged}:{native:NativePage;source:PdfSource;edits:ExistingTextEdit[];rotation:number;enabled:boolean;selected?:string;select:(id?:string)=>void;commit:(edit:ExistingTextEdit)=>void;draftChanged:(edit?:ExistingTextEdit)=>void}){
 const [draft,setDraft]=useState<ExistingTextEdit>(),[family,setFamily]=useState('sans-serif'),[message,setMessage]=useState('');
 const [baselineOffset,setBaselineOffset]=useState(0);
 const cancel=useRef(false),input=useRef<HTMLTextAreaElement>(null);
 const patches=useRef(new Map<string,ReturnType<typeof patchForRegion>>());
 useEffect(()=>{draftChanged(draft);},[draft,draftChanged]);
 useEffect(()=>{setDraft(undefined);patches.current.clear();},[native]);
 useEffect(()=>{if(!enabled){cancel.current=true;setDraft(undefined);}},[enabled]);
 useEffect(()=>()=>{cancel.current=true;},[]);
 async function start(r:NativeRegion){
  const edit=edits.find(e=>e.id===r.id)??beginTextEdit(r);select(r.id);setMessage('');cancel.current=false;
  try{const doc=await PDFDocument.create(),font=await resolveNativeFont(doc,source,edit);if(cancel.current)return;setFamily(font.family);
   const context=document.createElement('canvas').getContext('2d')!;context.font=`${edit.italic?'italic ':''}${edit.bold?'bold ':''}${edit.fontSize}px ${font.family}`;
   const metrics=context.measureText(edit.newText||'M'),ascent=metrics.fontBoundingBoxAscent??edit.fontSize*.8,descent=metrics.fontBoundingBoxDescent??edit.fontSize*.2;
   setBaselineOffset(edit.baseline-((edit.height-ascent-descent)/2+ascent));
   setDraft({...edit,fontMatch:font.status});requestAnimationFrame(()=>{input.current?.focus();input.current?.select();});}catch(e){setMessage((e as Error).message);}
 }
 async function save(){
  if(cancel.current||!draft)return;const edit=draft;
  try{const font=await resolveNativeFont(await PDFDocument.create(),source,edit);if(cancel.current)return;if(edit.changed||edit.newText!==edit.originalText)commit({...edit,fontMatch:font.status,changed:true});setDraft(undefined);setMessage(nativeTextWidth(edit,font)>edit.width+.5?'Text may not fit in the original area.':'');}catch(e){setMessage((e as Error).message);input.current?.focus();}
 }
 return <g transform={pageMatrix(rotation,native.width,native.height)} data-native-text-layer>
  {native.regions.map(r=>{
   const edit=edits.find(e=>e.id===r.id),active=draft?.id===r.id,value=active?draft:edit;
   if(value&&!patches.current.has(r.id))patches.current.set(r.id,patchForRegion(native,r));
   const patch=patches.current.get(r.id);
   return <g key={r.id}>
    {value&&patch&&<g transform={`translate(${r.x} ${r.y}) rotate(${r.rotation})`} pointerEvents="none"><image href={patch.data} x={-patch.pad} y={-patch.pad} width={r.width+2*patch.pad} height={r.height+2*patch.pad}/></g>}
    {edit&&!active&&<g transform={`translate(${edit.x} ${edit.y}) rotate(${edit.rotation})`} pointerEvents="none"><Replacement edit={edit} source={source}/></g>}
    {enabled&&!active&&<rect data-native-region={r.id} aria-label={`Edit existing text: ${edit?.newText??r.originalText}`} role="button" tabIndex={0} transform={`translate(${r.x} ${r.y}) rotate(${r.rotation})`} width={r.width} height={r.height} className={styles.nativeHit} data-selected={selected===r.id} onPointerDown={e=>{e.stopPropagation();select(r.id);}} onDoubleClick={e=>{e.stopPropagation();void start(r);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void start(r);}}}><title>Double-click to edit text</title></rect>}
    {active&&<foreignObject transform={`translate(${draft.x} ${draft.y}) rotate(${draft.rotation})`} width={Math.max(draft.width,30)} height={Math.max(draft.height,draft.fontSize*1.3)} style={{overflow:'visible'}} onPointerDown={e=>e.stopPropagation()}>
     <textarea ref={input} aria-label="Edit existing PDF text" value={draft.newText} spellCheck={false} className={styles.nativeInput} style={{transform:`translateY(${baselineOffset}px)`,fontFamily:family,fontSize:draft.fontSize,fontWeight:draft.bold?'bold':'normal',fontStyle:draft.italic?'italic':'normal',color:draft.color,textAlign:draft.align,lineHeight:`${draft.height}px`,letterSpacing:`${draft.characterSpacing}px`,wordSpacing:`${draft.wordSpacing}px`,direction:draft.direction==='rtl'?'rtl':'ltr'}} onChange={e=>{const newText=e.target.value.replace(/\n/g,'');setDraft({...draft,newText,changed:newText!==draft.originalText||draft.changed});}} onBlur={()=>void save()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){cancel.current=true;setDraft(undefined);setMessage('');}else if(e.key==='Enter'){e.preventDefault();void save();}}}/>
    </foreignObject>}
   </g>;
  })}
  {message&&<foreignObject x={8} y={8} width={Math.max(100,native.width-16)} height={48}><div className={styles.nativeMessage} role="status">{message}</div></foreignObject>}
 </g>;
}

