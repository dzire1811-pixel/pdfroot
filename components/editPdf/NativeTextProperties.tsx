import { useEffect, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import type { ExistingTextEdit } from '@/lib/editPdf/nativeText';
import type { PdfSource } from '@/lib/editPdf/model';
import { resolveNativeFont, nativeTextWidth } from '@/lib/editPdf/nativeFonts';
import styles from './EditPdf.module.css';
export function NativeTextProperties({edit,source,change,reset,open,close}:{edit:ExistingTextEdit;source:PdfSource;change:(edit:ExistingTextEdit)=>void;reset:()=>void;open:boolean;close:()=>void}){
 const [message,setMessage]=useState(''),[status,setStatus]=useState('Closest match');
 useEffect(()=>{let active=true;void PDFDocument.create().then(doc=>resolveNativeFont(doc,source,edit)).then(r=>{if(active){setStatus(r.status==='embedded'?'Original font':'Closest match');setMessage(nativeTextWidth(edit,r)>edit.width+.5?'Text may not fit in the original area.':'');}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[edit,source]);
 const patch=(p:Partial<ExistingTextEdit>)=>change({...edit,...p,changed:true});
 const fitToWidth=async()=>{try{const resolved=await resolveNativeFont(await PDFDocument.create(),source,edit),width=nativeTextWidth(edit,resolved);if(width>edit.width&&width>0)patch({fontSize:Math.max(1,edit.fontSize*edit.width/width)});}catch(e){setMessage((e as Error).message);}};
 return <aside className={styles.properties} data-open={open} aria-label="Existing text properties">
  <div className={styles.row}><strong>Existing text</strong><button className={styles.button} onClick={close}>Close</button></div>
  <div className={styles.nativeProperties}>
   <p className={styles.hint}>Double-click text on the page to edit it in place.</p>
   <label>Text content<textarea aria-label="Existing text content" value={edit.newText} onChange={e=>patch({newText:e.target.value.replace(/\n/g,'')})}/></label>
   <label>Font<select aria-label="Existing text font" value={edit.resolvedFont} onChange={e=>patch({resolvedFont:e.target.value})}><option value="auto">Original / closest match</option><option value="Helvetica">Sans serif</option><option value="Times">Serif</option><option value="Courier">Monospace</option></select></label>
   <p className={styles.hint}>{status}</p>
   <label>Font size<input aria-label="Existing text font size" type="number" min={1} max={300} step={.01} value={Number(edit.fontSize.toFixed(2))} onChange={e=>patch({fontSize:Math.max(1,Math.min(300,Number(e.target.value)||1))})}/></label>
   <div className={styles.row}><button className={styles.button} aria-pressed={edit.bold} onClick={()=>patch({bold:!edit.bold})}>Bold</button><button className={styles.button} aria-pressed={edit.italic} onClick={()=>patch({italic:!edit.italic})}>Italic</button></div>
   <label>Color<input aria-label="Existing text color" type="color" value={edit.color} onChange={e=>patch({color:e.target.value})}/></label>
   <label>Alignment<select aria-label="Existing text alignment" value={edit.align} onChange={e=>patch({align:e.target.value as ExistingTextEdit['align']})}>{['left','center','right'].map(a=><option key={a}>{a}</option>)}</select></label>
   <label>Rotation<input aria-label="Existing text rotation" type="number" value={edit.rotation} onChange={e=>patch({rotation:Number(e.target.value)||0})}/></label>
   {message&&<p className={styles.nativeMessage} role="status">{message}</p>}
   <button className={styles.button} onClick={()=>void fitToWidth()} disabled={!message.includes('may not fit')}>Fit text to original width</button>
   <button className={styles.button} onClick={reset}>Reset to Original</button>
   <p className={styles.hint}>Replacement covers the original appearance. Original text can remain recoverable; this is not secure removal.</p>
  </div>
 </aside>;
}
