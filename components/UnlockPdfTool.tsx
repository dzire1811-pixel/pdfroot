"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { Download, Eye, EyeOff, FileText, RefreshCcw, UnlockKeyhole, UploadCloud } from "lucide-react";

type UnlockResult = {
  url: string;
  sizeKb: number;
};

function formatKb(bytes: number) {
  return (bytes / 1024).toFixed(1);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "PDFRoot";
}

function looksEncrypted(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 250000)));
  return text.includes("/Encrypt");
}

function friendlyUnlockError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/password|invalid|decrypt|encryption|readFile|No such file/i.test(message)) {
    return "Could not unlock this PDF. Please check the password and try again.";
  }

  return "Could not unlock this PDF. Please try another file.";
}

export function UnlockPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Upload a protected PDF to unlock it.");
  const [result, setResult] = useState<UnlockResult | null>(null);

  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
  }

  function resetTool() {
    clearResult();
    setFile(null);
    setIsEncrypted(false);
    setPassword("");
    setShowPassword(false);
    setError(null);
    setIsDragging(false);
    setIsProcessing(false);
    setProgress(0);
    setStatus("Upload a protected PDF to unlock it.");
  }

  async function handleFile(nextFile: File | undefined) {
    setError(null);
    clearResult();
    setProgress(0);
    setPassword("");
    setIsEncrypted(false);

    if (!nextFile) return;
    if (!isPdf(nextFile)) {
      setFile(null);
      setStatus("Upload a protected PDF to unlock it.");
      setError(`"${nextFile.name}" is not a PDF file. Please upload a PDF only.`);
      return;
    }

    setFile(nextFile);
    setIsProcessing(true);
    setStatus("Checking PDF security...");

    try {
      const bytes = new Uint8Array(await nextFile.arrayBuffer());
      const encrypted = looksEncrypted(bytes);
      setIsEncrypted(encrypted);
      setStatus(encrypted ? "Password-protected PDF detected. Enter the password to unlock it." : "This PDF does not appear to need a password. You can create an unlocked copy.");
      setProgress(20);
    } catch {
      setError("Could not read this PDF file. Please try another PDF.");
      setStatus("PDF check failed.");
      setFile(null);
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function validateForm() {
    if (!file) return "Please upload a PDF first.";
    if (isEncrypted && !password.trim()) return "Password is required to unlock this PDF.";
    return null;
  }

  async function unlockPdf() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!file) return;

    setError(null);
    clearResult();
    setIsProcessing(true);
    setProgress(30);
    setStatus("Loading PDF unlock engine...");

    try {
      const { default: initQpdf } = await import("qpdf-wasm");
      const qpdf = await initQpdf({
        locateFile: (path) => {
          if (path.endsWith(".wasm")) return "/qpdf.wasm";
          if (path.endsWith(".js")) return "/qpdf.js";
          return path;
        },
        print: () => undefined,
        printErr: () => undefined,
      });

      const inputPath = "/locked.pdf";
      const outputPath = "/unlocked.pdf";
      setProgress(50);
      setStatus("Reading PDF file...");
      qpdf.FS.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));

      setProgress(72);
      setStatus("Removing password protection...");
      const passwordArgs = isEncrypted ? [`--password=${password}`] : [];
      qpdf.callMain([...passwordArgs, "--decrypt", inputPath, outputPath]);

      setProgress(90);
      setStatus("Preparing unlocked PDF...");
      const unlockedBytes = qpdf.FS.readFile(outputPath);
      const blob = new Blob([unlockedBytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setResult({ url, sizeKb: blob.size / 1024 });
      setProgress(100);
      setStatus("Unlocked PDF is ready to download.");

      try {
        qpdf.FS.unlink(inputPath);
        qpdf.FS.unlink(outputPath);
      } catch {
        // Files are temporary in the in-browser engine.
      }
    } catch (err) {
      setProgress(0);
      setStatus("PDF unlock failed.");
      setError(friendlyUnlockError(err));
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section id="unlock-pdf-tool" className="mx-auto mt-6 max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label
            htmlFor="unlock-pdf-upload"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-7 text-center transition ${
              isDragging ? "border-[#FF2D2D] bg-red-50" : "border-red-200 bg-red-50/40 hover:border-[#FF2D2D] hover:bg-red-50"
            }`}
          >
            <input id="unlock-pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onInputChange} />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#FF2D2D] shadow-[0_12px_35px_rgba(255,45,45,0.16)] transition group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
              <UnlockKeyhole className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="mt-5 text-xl font-black text-slate-950">Drag & Drop PDF</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">Upload one PDF file, enter the password if required, and download an unlocked PDF.</span>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-3 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)]">
              Choose PDF
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Secure Files", "Fast Processing", "Instant Download"].map((label) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight text-slate-950">Unlock PDF</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Remove password protection from PDFs you are allowed to access.</p>
            </div>
            <FileText className="h-6 w-6 text-[#FF2D2D]" aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected PDF</p>
            <p className="mt-2 truncate text-sm font-black text-slate-950">{file?.name ?? "No PDF uploaded"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Original size: {file ? `${formatKb(file.size)} KB` : "No file selected"}</p>
          </div>

          {file && isEncrypted && (
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="unlock-password" className="text-sm font-black text-slate-950">
                  PDF Password
                </label>
                <input
                  id="unlock-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                    clearResult();
                  }}
                  placeholder="Enter PDF password"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                {showPassword ? "Hide Password" : "Show Password"}
              </button>
            </div>
          )}

          <p className="mt-5 text-sm font-bold text-slate-600">{status}</p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#FF2D2D] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void unlockPdf()}
              disabled={!file || isProcessing}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-6 py-4 text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isProcessing ? "Processing..." : "Unlock PDF"}
              <UnlockKeyhole className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={resetTool} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 transition hover:border-red-200 hover:text-[#FF2D2D]">
              Clear
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {result && (
            <a href={result.url} download={`${cleanFileName(file?.name ?? "unlocked")}-unlocked.pdf`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
              Download Unlocked PDF ({result.sizeKb.toFixed(1)} KB)
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
