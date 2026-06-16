"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, Dispatch, DragEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import { Download, FileImage, FileText, ImagePlus, RotateCw, ShieldCheck, UploadCloud } from "lucide-react";
import { isStoredImage, readUploadSession } from "@/lib/uploadSession";

type Side = "front" | "back";
type LayoutMode = "horizontal" | "vertical" | "a4" | "card";
type OutputFormat = "jpg" | "png" | "pdf";

type SideState = {
  file: File | null;
  url: string | null;
  rotation: number;
  isDragging: boolean;
};

type OutputState = {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  fileName: string;
};

const supportedDocuments = [
  "Aadhaar Card",
  "PAN Card",
  "Voter ID",
  "Driving Licence",
  "RC Book",
  "Passport",
  "ATM Card",
  "Employee ID Card",
  "Student ID Card",
  "Custom Document",
];

function isImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function formatKb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Please upload JPG, JPEG, or PNG."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.94) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not create output file."));
      },
      type,
      quality,
    );
  });
}

function getTrimBox(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { x: 0, y: 0, width: canvas.width, height: canvas.height };

  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2]];
  };
  const corners = [sample(0, 0), sample(width - 1, 0), sample(0, height - 1), sample(width - 1, height - 1)];
  const bg = corners.reduce(
    (acc, color) => [acc[0] + color[0] / 4, acc[1] + color[1] / 4, acc[2] + color[2] / 4],
    [0, 0, 0],
  );
  const threshold = 38;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const delta = Math.abs(data[index] - bg[0]) + Math.abs(data[index + 1] - bg[1]) + Math.abs(data[index + 2] - bg[2]);
      if (delta > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    return { x: 0, y: 0, width, height };
  }

  const pad = Math.round(Math.min(width, height) * 0.015);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function prepareImage(image: HTMLImageElement, rotation: number, autoCrop: boolean) {
  const base = document.createElement("canvas");
  base.width = image.naturalWidth;
  base.height = image.naturalHeight;
  const baseContext = base.getContext("2d");
  if (!baseContext) throw new Error("Your browser does not support image processing.");
  baseContext.fillStyle = "#ffffff";
  baseContext.fillRect(0, 0, base.width, base.height);
  baseContext.drawImage(image, 0, 0);

  const crop = autoCrop ? getTrimBox(base) : { x: 0, y: 0, width: base.width, height: base.height };
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotated = document.createElement("canvas");
  const swap = normalizedRotation === 90 || normalizedRotation === 270;
  rotated.width = swap ? crop.height : crop.width;
  rotated.height = swap ? crop.width : crop.height;
  const context = rotated.getContext("2d");
  if (!context) throw new Error("Your browser does not support image processing.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, rotated.width, rotated.height);
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate((normalizedRotation * Math.PI) / 180);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(base, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
  return rotated;
}

function containRect(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  };
}

export function FrontBackCardMergeTool() {
  const [front, setFront] = useState<SideState>({ file: null, url: null, rotation: 0, isDragging: false });
  const [back, setBack] = useState<SideState>({ file: null, url: null, rotation: 0, isDragging: false });
  const [layout, setLayout] = useState<LayoutMode>("horizontal");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("jpg");
  const [title, setTitle] = useState("");
  const [addBorder, setAddBorder] = useState(true);
  const [autoCrop, setAutoCrop] = useState(true);
  const [spacing, setSpacing] = useState(48);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Upload front and back side images to create a printable page.");
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedSummary = useMemo(
    () => [
      front.file ? `Front: ${front.file.name} (${formatKb(front.file.size)})` : "Front side not uploaded",
      back.file ? `Back: ${back.file.name} (${formatKb(back.file.size)})` : "Back side not uploaded",
    ],
    [front.file, back.file],
  );

  function clearOutput() {
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);
  }

  function handleFile(side: Side, file: File | undefined) {
    setError(null);
    clearOutput();
    if (!file) return;
    if (!isImage(file)) {
      setError("Please upload only JPG, JPEG, PNG, or WEBP images.");
      return;
    }

    const setter = side === "front" ? setFront : setBack;
    setter((state) => {
      if (state.url) URL.revokeObjectURL(state.url);
      return { ...state, file, url: URL.createObjectURL(file), rotation: 0 };
    });
    setStatus(`${side === "front" ? "Front" : "Back"} side selected.`);
    setProgress(0);
  }

  function onInputChange(side: Side, event: ChangeEvent<HTMLInputElement>) {
    handleFile(side, event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(side: Side, event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const setter = side === "front" ? setFront : setBack;
    setter((state) => ({ ...state, isDragging: false }));
    handleFile(side, event.dataTransfer.files?.[0]);
  }

  function rotate(side: Side) {
    clearOutput();
    const setter = side === "front" ? setFront : setBack;
    setter((state) => ({ ...state, rotation: (state.rotation + 90) % 360 }));
  }

  useEffect(() => {
    let isActive = true;
    void readUploadSession(isStoredImage).then((files) => {
      if (!isActive) return;
      if (files[0]) handleFile("front", files[0]);
      if (files[1]) handleFile("back", files[1]);
    });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buildCanvas() {
    if (!front.file || !back.file) {
      throw new Error("Please upload both front and back side images.");
    }

    const [frontImage, backImage] = await Promise.all([loadImage(front.file), loadImage(back.file)]);
    const frontCanvas = prepareImage(frontImage, front.rotation, autoCrop);
    const backCanvas = prepareImage(backImage, back.rotation, autoCrop);
    const titleHeight = title.trim() ? 86 : 0;
    const borderOffset = addBorder ? 18 : 0;

    let canvasWidth = 1600;
    let canvasHeight = 1000;
    let frontBox = { x: 0, y: 0, width: 700, height: 470 };
    let backBox = { x: 0, y: 0, width: 700, height: 470 };

    if (layout === "horizontal") {
      canvasWidth = 1800;
      canvasHeight = 1100 + titleHeight;
      frontBox = { x: 110, y: 160 + titleHeight, width: 760, height: 620 };
      backBox = { x: 930, y: 160 + titleHeight, width: 760, height: 620 };
    } else if (layout === "vertical") {
      canvasWidth = 1300;
      canvasHeight = 1800 + titleHeight;
      frontBox = { x: 170, y: 130 + titleHeight, width: 960, height: 680 };
      backBox = { x: 170, y: 130 + titleHeight + 680 + spacing, width: 960, height: 680 };
    } else if (layout === "a4") {
      canvasWidth = 2480;
      canvasHeight = 3508;
      frontBox = { x: 340, y: 520 + titleHeight, width: 1800, height: 980 };
      backBox = { x: 340, y: 520 + titleHeight + 980 + spacing, width: 1800, height: 980 };
    } else {
      canvasWidth = 1600;
      canvasHeight = 1000 + titleHeight;
      frontBox = { x: 130, y: 160 + titleHeight, width: 620, height: 460 };
      backBox = { x: 850, y: 160 + titleHeight, width: 620, height: 460 };
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser does not support image processing.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (title.trim()) {
      context.fillStyle = "#0f172a";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "800 54px Arial, sans-serif";
      context.fillText(title.trim(), canvas.width / 2, 80);
    }

    const drawItem = (source: HTMLCanvasElement, box: typeof frontBox) => {
      const target = containRect(source.width, source.height, box.width - borderOffset * 2, box.height - borderOffset * 2);
      if (addBorder) {
        context.save();
        context.strokeStyle = "#0f172a";
        context.lineWidth = layout === "a4" ? 5 : 3;
        context.strokeRect(box.x, box.y, box.width, box.height);
        context.restore();
      }
      context.drawImage(source, box.x + borderOffset + target.x, box.y + borderOffset + target.y, target.width, target.height);
    };

    drawItem(frontCanvas, frontBox);
    drawItem(backCanvas, backBox);
    return canvas;
  }

  async function createOutput() {
    setError(null);
    clearOutput();
    setIsProcessing(true);
    setProgress(20);
    setStatus("Reading and aligning images...");

    try {
      const canvas = await buildCanvas();
      setProgress(72);
      setStatus("Creating print-ready output...");

      if (outputFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
        const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height], compress: true });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, canvas.width, canvas.height);
        const blob = pdf.output("blob");
        setOutput({ blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, fileName: "front-back-card-merge.pdf" });
      } else {
        const mime = outputFormat === "png" ? "image/png" : "image/jpeg";
        const blob = await canvasToBlob(canvas, mime, 0.94);
        setOutput({
          blob,
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
          fileName: `front-back-card-merge.${outputFormat}`,
        });
      }

      setProgress(100);
      setStatus("Merged file ready. Download your output.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge the images.");
      setStatus("Merge failed.");
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="front-back-card-merge-tool" className="mx-auto mt-6 max-w-6xl text-left">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF2D2D]">Browser-only processing</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Merge both sides into one printable file</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Upload front and back side images of Aadhaar, PAN, Voter ID, Driving Licence, RC Book, Passport, ID cards, ATM cards, or any custom document. Files are processed in your browser only.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            No server upload
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {supportedDocuments.map((item) => (
            <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <UploadSideCard side="front" title="Front Side Image" state={front} onInputChange={onInputChange} onDrop={onDrop} setDragging={setFront} onRotate={rotate} />
        <UploadSideCard side="back" title="Back Side Image" state={back} onInputChange={onInputChange} onDrop={onDrop} setDragging={setBack} onRotate={rotate} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
          <h3 className="text-xl font-black text-slate-950">Layout & Output</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SelectButton label="Side by Side" selected={layout === "horizontal"} onClick={() => { setLayout("horizontal"); clearOutput(); }} />
            <SelectButton label="Top & Bottom" selected={layout === "vertical"} onClick={() => { setLayout("vertical"); clearOutput(); }} />
            <SelectButton label="A4 Print Layout" selected={layout === "a4"} onClick={() => { setLayout("a4"); clearOutput(); }} />
            <SelectButton label="Card Size Layout" selected={layout === "card"} onClick={() => { setLayout("card"); clearOutput(); }} />
          </div>

          <label className="mt-5 block text-sm font-black text-slate-800">
            Document Title
            <input value={title} onChange={(event) => { setTitle(event.target.value); clearOutput(); }} placeholder="Optional title" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" />
          </label>

          <label className="mt-5 block text-sm font-black text-slate-800">
            Spacing between images: {spacing}px
            <input value={spacing} min={16} max={160} type="range" onChange={(event) => { setSpacing(Number(event.target.value)); clearOutput(); }} className="mt-3 w-full accent-[#FF2D2D]" />
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ToggleButton label="Auto Crop Background" active={autoCrop} onClick={() => { setAutoCrop(!autoCrop); clearOutput(); }} />
            <ToggleButton label="Add Border" active={addBorder} onClick={() => { setAddBorder(!addBorder); clearOutput(); }} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SelectButton label="JPG" selected={outputFormat === "jpg"} onClick={() => { setOutputFormat("jpg"); clearOutput(); }} />
            <SelectButton label="PNG" selected={outputFormat === "png"} onClick={() => { setOutputFormat("png"); clearOutput(); }} />
            <SelectButton label="PDF" selected={outputFormat === "pdf"} onClick={() => { setOutputFormat("pdf"); clearOutput(); }} />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected files</p>
            {selectedSummary.map((item) => (
              <p key={item} className="mt-2 truncate text-sm font-bold text-slate-700">{item}</p>
            ))}
          </div>

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
          <button
            type="button"
            onClick={() => void createOutput()}
            disabled={isProcessing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? "Merging..." : "Merge Front & Back"}
            <Download className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)] sm:p-6">
          <h3 className="text-xl font-black text-slate-950">Final Preview</h3>
          <div className="mt-4 grid min-h-[420px] place-items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4">
            {output ? (
              outputFormat === "pdf" ? (
                <div className="text-center">
                  <FileText className="mx-auto h-16 w-16 text-[#FF2D2D]" aria-hidden="true" />
                  <p className="mt-4 text-sm font-black text-slate-950">PDF generated successfully</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{output.width} x {output.height}px</p>
                </div>
              ) : (
                <img src={output.url} alt="Merged front and back card preview" className="max-h-[520px] max-w-full object-contain" />
              )
            ) : (
              <div className="max-w-sm text-center">
                <FileImage className="mx-auto h-16 w-16 text-slate-300" aria-hidden="true" />
                <p className="mt-4 text-sm font-bold leading-6 text-slate-500">Preview will appear here after merging both side images.</p>
              </div>
            )}
          </div>
          {output && (
            <a href={output.url} download={output.fileName} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download {outputFormat.toUpperCase()}
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function UploadSideCard({
  side,
  title,
  state,
  onInputChange,
  onDrop,
  setDragging,
  onRotate,
}: {
  side: Side;
  title: string;
  state: SideState;
  onInputChange: (side: Side, event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (side: Side, event: DragEvent<HTMLLabelElement>) => void;
  setDragging: Dispatch<SetStateAction<SideState>>;
  onRotate: (side: Side) => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <label
        htmlFor={`card-${side}-upload`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging((current) => ({ ...current, isDragging: true }));
        }}
        onDragLeave={() => setDragging((current) => ({ ...current, isDragging: false }))}
        onDrop={(event) => onDrop(side, event)}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
          state.isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
        }`}
      >
        <input id={`card-${side}-upload`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onInputChange(side, event)} />
        <ImagePlus className="h-10 w-10 text-[#FF2D2D]" aria-hidden="true" />
        <span className="mt-5 text-xl font-black text-slate-950">{title}</span>
        <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload JPG, JPEG, or PNG. Drag & drop is supported.</span>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
          Choose Image
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
      </label>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{side} side</p>
        <p className="mt-2 truncate text-sm font-black text-slate-950">{state.file?.name ?? "No image uploaded"}</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">Rotation: {state.rotation}°</p>
      </div>
      {state.url && (
        <>
          <div className="mt-4 grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
            <img src={state.url} alt={`${side} side preview`} style={{ transform: `rotate(${state.rotation}deg)` }} className="max-h-72 max-w-full object-contain transition" />
          </div>
          <button type="button" onClick={() => onRotate(side)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
            Rotate Image
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function SelectButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[58px] rounded-2xl border px-4 py-3 text-sm font-black transition ${
        selected ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]"
      }`}
    >
      {label}
    </button>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[58px] items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition ${
        active ? "border-[#FF2D2D] bg-red-50 text-[#FF2D2D]" : "border-slate-200 bg-white text-slate-700 hover:border-red-200"
      }`}
    >
      <span className={`h-5 w-5 rounded-full border-2 ${active ? "border-[#FF2D2D] bg-[#FF2D2D]" : "border-slate-300 bg-white"}`} />
      {label}
    </button>
  );
}
