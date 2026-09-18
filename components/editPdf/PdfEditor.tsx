import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, PanelsTopLeft, SlidersHorizontal, Check } from "lucide-react";
import { defaults, duplicatePage, newObject, rotatePage, sizeLabel, uid, type EditObject, type EditorState, type ImageAsset, type PdfSource, type ToolMode } from "@/lib/editPdf/model";
import { MAX_PAGES, MAX_PDF_BYTES, readImage, readPdf, storeImage } from "@/lib/editPdf/assets";
import { useEditorHistory } from "@/lib/editPdf/history";
import type { EditorFonts } from "@/lib/editPdf/text";
import { PdfToolbar } from "./PdfToolbar";
import { PdfCanvas } from "./PdfCanvas";
import { PageSidebar } from "./PageSidebar";
import { PropertiesPanel } from "./PropertiesPanel";
import { SignatureDialog } from "./SignatureDialog";
import { analyzeNativePage, beginTextEdit, type NativePage, type ExistingTextEdit } from "@/lib/editPdf/nativeText";
import { NativeTextProperties } from "./NativeTextProperties";
import styles from "./EditPdf.module.css";

export function PdfEditor({ initial, sources, assets, fonts, file, apply, reset, busy }: {
  initial: EditorState; sources: Map<string, PdfSource>; assets: Map<string, ImageAsset>; fonts: EditorFonts; file: File;
  apply: (state: EditorState) => void; reset: () => void; busy: boolean;
}) {
  const history = useEditorHistory(initial), { state, update, undo, redo } = history;
  const [tool, setTool] = useState<ToolMode>("select"), [selected, setSelected] = useState<string>(), [settings, setSettings] = useState(newObject("text", 0, 0));
  const [zoom, setZoom] = useState(1), [drawer, setDrawer] = useState<"pages" | "properties" | null>(null), [more, setMore] = useState(false), [signature, setSignature] = useState(false);
  const [savedSignature, setSavedSignature] = useState<ImageAsset>(), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null), pdfInput = useRef<HTMLInputElement>(null), replaceId = useRef<string | undefined>(undefined), clipboard = useRef<EditObject | undefined>(undefined);
  const mounted = useRef(true), working = useRef(false), workspace = useRef<HTMLElement>(null);
  useEffect(() => { mounted.current = true; workspace.current?.scrollIntoView({ block: "start" }); return () => { mounted.current = false; }; }, []);
  const page = state.pages.find(p => p.id === state.activeId) ?? state.pages[0], index = state.pages.indexOf(page), object = page.objects.find(o => o.id === selected);
  const [native, setNative] = useState<NativePage>(), [nativeStatus, setNativeStatus] = useState("");
  const nativeDraft = useRef<ExistingTextEdit | undefined>(undefined);
  const source = page.sourceId ? sources.get(page.sourceId) : undefined;
  useEffect(() => {
    let active = true; setNative(undefined); nativeDraft.current = undefined;
    if (!source) { setNativeStatus(""); return; }
    setNativeStatus("Detecting existing text…");
    void analyzeNativePage(source, page.sourceIndex).then(result => { if (active) { setNative(result); setNativeStatus(result.type === "scanned" ? "This page appears to be scanned. Text recognition is required before existing text can be edited." : result.type === "outlines" ? "This page has no selectable text. Outlined or vector lettering cannot be edited directly." : result.type === "empty" ? "No existing text was found on this page." : result.type === "mixed" ? "Double-click existing text to edit. Text inside images is not directly editable." : "Double-click existing text to edit it in place."); } }).catch(() => { if (active) setNativeStatus("Existing text could not be analyzed on this page. Added objects are still available."); });
    return () => { active = false; };
  }, [source, page.sourceIndex, page.id]);
  const nativeRegion = native?.regions.find(r => r.id === selected);
  const nativeEdit = nativeRegion ? page.existingTextEdits?.find(e => e.id === selected) ?? beginTextEdit(nativeRegion) : undefined;
  const commitNative = (edit: ExistingTextEdit) => update({ ...state, pages: state.pages.map(p => p.id === page.id ? { ...p, existingTextEdits: [...(p.existingTextEdits ?? []).filter(e => e.id !== edit.id), edit] } : p) });
  const applyAll = () => {
    const draft = nativeDraft.current;
    const final = draft?.changed ? { ...state, pages: state.pages.map(p => p.id === page.id ? { ...p, existingTextEdits: [...(p.existingTextEdits ?? []).filter(e => e.id !== draft.id), draft] } : p) } : state;
    if (draft) update(final); setSelected(undefined); apply(final);
  };
  const modifyObjects = useCallback((objects: EditObject[]) => update({ ...state, pages: state.pages.map(p => p.id === page.id ? { ...p, objects } : p) }), [state, page.id, update]);
  const remove = useCallback(() => { if (selected) { modifyObjects(page.objects.filter(o => o.id !== selected)); setSelected(undefined); } }, [selected, modifyObjects, page.objects]);
  const add = useCallback((o: EditObject) => { modifyObjects([...page.objects, o]); setSelected(o.id); setTool("select"); if (o.type === "text") setDrawer("properties"); }, [modifyObjects, page.objects]);
  const duplicate = useCallback((o = object) => { if (o) add({ ...o, id: uid(), x: o.x + 12, y: o.y + 12 }); }, [object, add]);
  const commit = useCallback((o: EditObject) => modifyObjects(page.objects.map(item => item.id === o.id ? o : item)), [modifyObjects, page.objects]);
  const chooseTool = (value: ToolMode) => {
    if (value === "image") { replaceId.current = undefined; imageInput.current?.click(); return; }
    if (value === "signature") { setSignature(true); return; }
    setTool(value); setSelected(undefined);
    if (["shape", "drawing", "text", "highlight", "cover", "whiteout", "eraser"].includes(value)) setDrawer("properties");
    if (value === "highlight") setSettings(s => ({ ...s, color: "#facc15", fill: "#facc15", opacity: .35 }));
    else setSettings(s => ({ ...s, ...defaults, text: s.text, font: s.font, fontSize: s.fontSize }));
  };
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (busy || loading || signature || (e.target instanceof HTMLElement && (e.target.matches("input,textarea,select") || e.target.isContentEditable))) return;
      const key = e.key.toLowerCase(), modifier = e.ctrlKey || e.metaKey;
      if (modifier && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (modifier && key === "y") { e.preventDefault(); redo(); }
      else if (modifier && key === "c" && object) { e.preventDefault(); clipboard.current = { ...object }; }
      else if (modifier && key === "v" && clipboard.current) { e.preventDefault(); duplicate(clipboard.current); }
      else if (modifier && key === "d" && object) { e.preventDefault(); duplicate(); }
      else if (["delete", "backspace"].includes(key) && object) { e.preventDefault(); remove(); }
      else if (key === "escape") { setSelected(undefined); setTool("select"); setDrawer(null); }
      else if (object && key.startsWith("arrow")) {
        e.preventDefault(); const step = e.shiftKey ? 10 : 1;
        commit({ ...object, x: object.x + (key === "arrowright" ? step : key === "arrowleft" ? -step : 0), y: object.y + (key === "arrowdown" ? step : key === "arrowup" ? -step : 0) });
      }
    }
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [busy, loading, signature, object, redo, undo, duplicate, remove, commit]);
  const navigate = (i: number) => { if (!state.pages[i]) return; update({ ...state, activeId: state.pages[i].id }, false); setSelected(undefined); };
  const pageAction = (id: string, action: "left" | "right" | "duplicate" | "delete") => {
    if (action === "duplicate" && state.pages.length >= MAX_PAGES) { setError("This editor supports up to 300 pages."); return; }
    let pages = state.pages, activeId = state.activeId;
    if (action === "delete") {
      if (pages.length === 1) return;
      const removedIndex = pages.findIndex(p => p.id === id); pages = pages.filter(p => p.id !== id);
      if (activeId === id) activeId = pages[Math.min(removedIndex, pages.length - 1)].id;
    } else if (action === "duplicate") { const copy = duplicatePage(pages.find(p => p.id === id)!); pages = pages.flatMap(p => p.id === id ? [p, copy] : [p]); activeId = copy.id; }
    else pages = pages.map(p => p.id === id ? rotatePage(p, action === "right" ? 90 : -90) : p);
    update({ pages, activeId }); setSelected(undefined);
  };
  const reorder = (from: number, to: number) => { if (from === to) return; const pages = [...state.pages], [moved] = pages.splice(from, 1); pages.splice(to, 0, moved); update({ ...state, pages }); };
  function insertImage(asset: ImageAsset, type: "image" | "signature") {
    const id = storeImage(assets, asset);
    const width = Math.min(220, page.width * .5), height = Math.min(page.height * .5, width * asset.height / asset.width), actualWidth = height * asset.width / asset.height;
    add({ ...newObject(type, (page.width - actualWidth) / 2, (page.height - height) / 2), width: actualWidth, height, assetId: id });
  }
  async function imageUpload(file?: File) {
    if (!file || working.current) return; working.current = true; setLoading(true); setError("");
    try {
      const asset = await readImage(file); if (!mounted.current) return;
      const replacement = page.objects.find(o => o.id === replaceId.current);
      if (replacement) { const id = storeImage(assets, asset); commit({ ...replacement, assetId: id }); }
      else insertImage(asset, "image");
    } catch (error) { if (mounted.current) setError((error as Error).message); }
    finally { working.current = false; if (mounted.current) setLoading(false); replaceId.current = undefined; }
  }
  async function appendPdf(file?: File) {
    if (!file || working.current) return; working.current = true; setLoading(true); setError("");
    try {
      if (Array.from(sources.values()).reduce((sum, s) => sum + s.bytes.length, file.size) > MAX_PDF_BYTES) throw new Error("Combined PDFs must stay under 100 MB. Start a new file to release earlier documents.");
      const added = await readPdf(file);
      if (!mounted.current) { await added.source.pdf.loadingTask.destroy(); return; }
      if (state.pages.length + added.pages.length > MAX_PAGES) { await added.source.pdf.loadingTask.destroy(); throw new Error("The combined document must have 300 pages or fewer."); }
      sources.set(added.id, added.source); update({ pages: [...state.pages, ...added.pages], activeId: added.pages[0].id });
    } catch (error) { if (mounted.current) setError((error as Error).message); }
    finally { working.current = false; if (mounted.current) setLoading(false); }
  }
  return <section ref={workspace} className={styles.workspace} aria-label="PDF editor workspace" aria-busy={busy || loading}>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Upload image" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void imageUpload(f); }} />
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden aria-label="Append PDF" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void appendPdf(f); }} />
    <fieldset disabled={busy || loading} style={{ display: "contents" }}>
      <div className={styles.filebar}><FileText size={17} /><span className={styles.filename} title={file.name}>{file.name}</span><span>{sizeLabel(file.size)}</span><span>All edits stay in your browser</span><button className={styles.button} onClick={reset}>New File</button></div>
      <PdfToolbar tool={tool} setTool={chooseTool} more={more} setMore={setMore} undo={undo} redo={redo} canUndo={history.canUndo} canRedo={history.canRedo} zoom={zoom} setZoom={setZoom} index={index} count={state.pages.length} navigate={navigate} apply={applyAll} />
      {nativeStatus && <p className={styles.nativeNotice} role="status">{nativeStatus}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.status} role="status">Preparing file…</p>}
      <div className={styles.body} style={busy || loading ? { pointerEvents: "none" } : undefined}>
        <PageSidebar pages={state.pages} activeId={page.id} sources={sources} select={navigate} action={pageAction} reorder={reorder} open={drawer === "pages"} close={() => setDrawer(null)} append={() => pdfInput.current?.click()} blank={() => {
          if (state.pages.length >= MAX_PAGES) { setError("This editor supports up to 300 pages."); return; }
          const blank = { id: uid(), sourceIndex: 0, rotation: 0, width: page.width, height: page.height, objects: [] };
          const pages = [...state.pages]; pages.splice(index + 1, 0, blank); update({ pages, activeId: blank.id });
        }} />
        <PdfCanvas page={page} source={page.sourceId ? sources.get(page.sourceId) : undefined} assets={assets} fonts={fonts} tool={tool} settings={settings} selected={selected} select={id => { setSelected(id); }} commit={commit} add={add} erase={id => modifyObjects(page.objects.filter(o => o.id !== id))} zoom={zoom} native={native} commitNative={commitNative} draftNative={edit => { nativeDraft.current = edit; }} />
        {nativeEdit && source ? <NativeTextProperties edit={nativeEdit} source={source} change={commitNative} reset={() => update({ ...state, pages: state.pages.map(p => p.id === page.id ? { ...p, existingTextEdits: (p.existingTextEdits ?? []).filter(e => e.id !== nativeEdit.id) } : p) })} open={drawer === "properties"} close={() => setDrawer(null)} /> : <PropertiesPanel objects={page.objects} select={id => { setSelected(id); setTool("select"); }} addText={() => add(newObject("text", Math.max(0, page.width / 2 - 90), Math.max(0, page.height / 2 - 24), settings))} object={object} settings={settings} tool={tool} change={patch => object ? commit({ ...object, ...patch }) : setSettings(s => ({ ...s, ...patch }))} remove={remove} duplicate={() => duplicate()} layer={direction => {
          if (!object) return; const objects = [...page.objects], from = objects.indexOf(object), to = Math.max(0, Math.min(objects.length - 1, from + direction)); objects.splice(from, 1); objects.splice(to, 0, object); modifyObjects(objects);
        }} replace={() => { replaceId.current = selected; imageInput.current?.click(); }} open={drawer === "properties"} close={() => setDrawer(null)} setTool={chooseTool} />}
      </div>
      <div className={styles.mobileNav}><button className={styles.button} aria-expanded={drawer === "pages"} onClick={() => setDrawer(drawer === "pages" ? null : "pages")}><PanelsTopLeft size={15} />Pages</button><button className={styles.button} aria-expanded={drawer === "properties"} onClick={() => setDrawer(drawer === "properties" ? null : "properties")}><SlidersHorizontal size={15} />Properties</button></div>
      <div className={styles.mobileApply}><button className={`${styles.button} ${styles.primary}`} onClick={applyAll}><Check size={16} />Apply Changes</button></div>
      <p className={styles.status}>Preview edits on the page before applying. 100% = fit page · Drag to move · Corner handle to resize · Ctrl+Z to undo · Cover Content is not secure redaction</p>
    </fieldset>
    {signature && <SignatureDialog close={() => setSignature(false)} saved={savedSignature} insert={(asset, save) => { try { insertImage(asset, "signature"); if (save) setSavedSignature(asset); } catch (error) { setError((error as Error).message); } setSignature(false); }} />}
  </section>;
}
