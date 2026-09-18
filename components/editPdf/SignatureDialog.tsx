import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { readImage } from "@/lib/editPdf/assets";
import type { ImageAsset } from "@/lib/editPdf/model";
import styles from "./EditPdf.module.css";

export function SignatureDialog({ close, insert, saved }: { close: () => void; insert: (asset: ImageAsset, save: boolean) => void; saved?: ImageAsset }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false);
  const [mode, setMode] = useState("draw"), [name, setName] = useState(""), [font, setFont] = useState("cursive"), [save, setSave] = useState(false), [hasInk, setHasInk] = useState(false), [error, setError] = useState("");
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  useEffect(() => {
    if (mode !== "type") return;
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, 900, 300); ctx.font = `italic 64px ${font}`; ctx.fillStyle = "#17202e"; ctx.textBaseline = "middle";
    ctx.fillText(name, 22, 150, 850);
  }, [name, font, mode]);
  function fromCanvas() {
    const c = canvas.current!, ctx = c.getContext("2d")!, pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (pixels[(y * c.width + x) * 4 + 3]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    if (minX > maxX) { setError("Draw or type your signature first."); return; }
    const cropped = document.createElement("canvas"); cropped.width = maxX - minX + 9; cropped.height = maxY - minY + 9;
    cropped.getContext("2d")!.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 4, 4, maxX - minX + 1, maxY - minY + 1);
    insert({ data: cropped.toDataURL("image/png"), width: cropped.width, height: cropped.height }, save);
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="signature-title" onCancel={close}>
    <h2 id="signature-title" className={styles.panelTitle}>Add your signature<button className={styles.button} aria-label="Close signature dialog" onClick={close}><X size={16} /></button></h2>
    <div className={styles.row}>{["draw", "type", "upload"].map(item => <button className={styles.button} aria-pressed={mode === item} key={item} onClick={() => { setMode(item); setHasInk(false); setError(""); canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 300); }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {mode === "type" && <><label className={styles.field}>Your name<input maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label className={styles.field}>Signature style<select value={font} onChange={e => setFont(e.target.value)}><option value="cursive">Handwritten</option><option value="serif">Classic italic</option><option value="sans-serif">Simple italic</option></select></label></>}
    {mode !== "upload" && <canvas ref={canvas} className={styles.signatureCanvas} width={900} height={300} aria-label="Signature drawing pad" onPointerDown={e => {
      if (mode !== "draw") return; const c = e.currentTarget, r = c.getBoundingClientRect(), ctx = c.getContext("2d")!;
      drawing.current = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo((e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 300 / r.height); ctx.lineWidth = 4; ctx.strokeStyle = "#17202e"; ctx.lineCap = "round";
    }} onPointerMove={e => { if (!drawing.current) return; const c = e.currentTarget, r = c.getBoundingClientRect(), ctx = c.getContext("2d")!; ctx.lineTo((e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 300 / r.height); ctx.stroke(); setHasInk(true); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />}
    <label className={styles.field}><span><input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} /> Save signature for this session</span></label>
    <p className={styles.hint}>Kept only in this editor’s memory. Closing or refreshing the page clears saved signatures. This is a visual signature, not a certificate-based digital signature.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {mode === "upload" ? <label className={styles.field}>Upload PNG/JPG signature<input type="file" accept="image/png,image/jpeg" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { insert(await readImage(file), save); } catch (error) { setError((error as Error).message); } }} /></label> : <div className={styles.row}><button className={styles.button} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 300); setName(""); setHasInk(false); }}>Clear signature</button><button className={`${styles.button} ${styles.primary}`} disabled={mode === "draw" ? !hasInk : !name.trim()} onClick={fromCanvas}>Insert signature</button></div>}
    {saved && <button className={styles.button} onClick={() => insert(saved, true)}>Use saved signature</button>}
  </dialog>;
}
