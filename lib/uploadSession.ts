"use client";

const uploadSessionKey = "PDFRoot:uploaded-files";

export type StoredUploadFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  dataUrl: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not store ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export async function saveUploadSession(files: File[]) {
  if (typeof window === "undefined" || files.length === 0) return;

  const storedFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
      dataUrl: await fileToDataUrl(file),
    })),
  );

  sessionStorage.setItem(uploadSessionKey, JSON.stringify(storedFiles));
}

export function clearUploadSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(uploadSessionKey);
  localStorage.removeItem(uploadSessionKey);
}

export async function readUploadSession(filter?: (file: StoredUploadFile) => boolean, consume = true) {
  if (typeof window === "undefined") return [];

  const raw = sessionStorage.getItem(uploadSessionKey);
  if (!raw) return [];

  if (consume) {
    sessionStorage.removeItem(uploadSessionKey);
    localStorage.removeItem(uploadSessionKey);
  }

  try {
    const storedFiles = JSON.parse(raw) as StoredUploadFile[];
    const matchingFiles = filter ? storedFiles.filter(filter) : storedFiles;

    return Promise.all(
      matchingFiles.map(async (storedFile) => {
        const response = await fetch(storedFile.dataUrl);
        const blob = await response.blob();
        return new File([blob], storedFile.name, {
          type: storedFile.type,
          lastModified: storedFile.lastModified,
        });
      }),
    );
  } catch {
    return [];
  }
}

export function isStoredImage(file: StoredUploadFile) {
  return /^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}
