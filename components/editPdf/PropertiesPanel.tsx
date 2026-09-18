import { Copy, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import type { EditObject, ToolMode } from "@/lib/editPdf/model";
import styles from "./EditPdf.module.css";

export function PropertiesPanel({ object, settings, tool, change, remove, duplicate, layer, replace, open, close, setTool, objects, select, addText }: {
  object?: EditObject; settings: EditObject; tool: ToolMode; change: (patch: Partial<EditObject>) => void;
  remove: () => void; duplicate: () => void; layer: (direction: number) => void; replace: () => void; open: boolean; close: () => void; setTool: (tool: ToolMode) => void;
  objects: EditObject[]; select: (id?: string) => void; addText: () => void;
}) {
  const o = object ?? settings, type = object?.type ?? tool;
  const number = (label: string, key: "fontSize" | "strokeWidth" | "rotation" | "width" | "height" | "x" | "y", min: number, max: number) => <label className={styles.field}>{label}<input type="number" aria-label={label} min={min} max={max} value={Number(o[key].toFixed(2))} onChange={e => { if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber)) change({ [key]: Math.min(max, Math.max(min, e.target.valueAsNumber)) }); }} /></label>;
  return <aside className={styles.properties} data-open={open} aria-label="Object properties">
    <h2 className={styles.panelTitle}>{object ? "Object properties" : "Tool properties"}<button className={`${styles.button} ${styles.mobileClose}`} aria-label="Close properties" onClick={close}><X size={14} /></button></h2>
    <label className={styles.field}>Select added object<select value={object?.id ?? ""} onChange={e => select(e.target.value || undefined)}><option value="">No selection</option>{objects.map((item, i) => <option key={item.id} value={item.id}>{i + 1}. {item.type}{item.type === "text" ? `: ${item.text.slice(0, 20)}` : ""}</option>)}</select></label>
    {!object && <p className={styles.hint}>{tool === "select" ? "Select an added object to move, resize or edit it." : tool === "text" ? "Click on the page to add text." : tool === "eraser" ? "Tap a drawing to erase the entire stroke." : "Drag on the page to place an overlay."}</p>}
    {type === "text" && <>
      {!object && <button className={styles.button} onClick={addText}>Add text in center</button>}
      <label className={styles.field}>Text content<textarea aria-label="Text content" value={o.text} onChange={e => change({ text: e.target.value })} /></label>
      <label className={styles.field}>Font family<select value={o.font} onChange={e => change({ font: e.target.value as EditObject["font"] })}>{["Arial", "Helvetica", "Times", "Courier"].map(font => <option key={font}>{font}</option>)}</select></label>
      {number("Font size", "fontSize", 6, 200)}
      <div className={styles.row}>{(["bold", "italic", "underline"] as const).map(key => <button key={key} className={styles.button} aria-label={key} aria-pressed={o[key]} onClick={() => change({ [key]: !o[key] })}>{key[0].toUpperCase()}</button>)}</div>
      <label className={styles.field}>Alignment<select value={o.align} onChange={e => change({ align: e.target.value as EditObject["align"] })}>{["left", "center", "right"].map(align => <option key={align}>{align}</option>)}</select></label>
      <p className={styles.hint}>Latin text supported. Text wraps inside the box; enlarge it to show more lines. Original PDF text is unchanged.</p>
    </>}
    {type === "shape" && <>
      <label className={styles.field}>Shape<select value={o.shape} onChange={e => change({ shape: e.target.value as EditObject["shape"] })}>{["rectangle", "circle", "line", "arrow"].map(shape => <option key={shape}>{shape}</option>)}</select></label>
      <label className={styles.field}>Fill<input type="color" value={o.fill === "transparent" ? "#ffffff" : o.fill} onChange={e => change({ fill: e.target.value })} /></label>
      <label className={styles.field}><span><input type="checkbox" checked={o.fill === "transparent"} onChange={e => change({ fill: e.target.checked ? "transparent" : "#ffffff" })} /> No fill</span></label>
    </>}
    {["text", "drawing", "highlight", "shape"].includes(type) && <label className={styles.field}>{type === "shape" ? "Border color" : "Color"}<input type="color" value={o.color} onChange={e => change({ color: e.target.value, ...(type === "highlight" ? { fill: e.target.value } : {}) })} /></label>}
    {["shape", "drawing"].includes(type) && <>{number("Stroke width", "strokeWidth", .5, 30)}<label className={styles.field}>Border style<select value={o.dashed ? "dashed" : "solid"} onChange={e => change({ dashed: e.target.value === "dashed" })}><option>solid</option><option>dashed</option></select></label></>}
    {(type === "drawing" || tool === "eraser") && <button className={styles.button} aria-pressed={tool === "eraser"} onClick={() => setTool(tool === "eraser" ? "drawing" : "eraser")}>Eraser (whole stroke)</button>}
    {!["select", "eraser"].includes(type) && <>
      {!["whiteout", "cover"].includes(type) && <label className={styles.field}>Opacity {Math.round(o.opacity * 100)}%<input type="range" min="5" max="100" value={o.opacity * 100} onChange={e => change({ opacity: Number(e.target.value) / 100 })} /></label>}
      {number("Rotation", "rotation", -360, 360)}
    </>}
    {object && <><div className={styles.row}>{number("Width", "width", 4, 14400)}{number("Height", "height", 4, 14400)}</div><div className={styles.row}>{number("X position", "x", -14400, 14400)}{number("Y position", "y", -14400, 14400)}</div>
      {(type === "image" || type === "signature") && <button className={styles.button} onClick={replace}>Replace Image</button>}
      <div className={styles.row}><button className={styles.button} title="Duplicate object" aria-label="Duplicate object" onClick={duplicate}><Copy size={15} /></button><button className={styles.button} title="Delete object" aria-label="Delete object" onClick={remove}><Trash2 size={15} /></button><button className={styles.button} title="Bring forward" aria-label="Bring forward" onClick={() => layer(1)}><ArrowUp size={15} /></button><button className={styles.button} title="Send backward" aria-label="Send backward" onClick={() => layer(-1)}><ArrowDown size={15} /></button></div>
    </>}
    {(type === "whiteout" || type === "cover") && <p className={styles.hint}>This only covers content visually. Underlying text and images remain recoverable. Do not use it to hide confidential information.</p>}
  </aside>;
}
