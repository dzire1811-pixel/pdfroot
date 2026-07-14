import type { CSSProperties } from "react";

const toolIconColors: Record<string, string> = {
  "merge-pdf": "#7C3AED",
  "split-pdf": "#7C3AED",
  "compress-pdf": "#7C3AED",
  "pdf-to-word": "#2F80ED",
  "pdf-to-excel": "#00A651",
  "pdf-to-powerpoint": "#FF7A00",
  "pdf-to-jpg": "#FFB000",
  "jpg-to-pdf": "#FFB000",
  "png-to-pdf": "#EF4444",
  "word-to-pdf": "#2F80ED",
  "excel-to-pdf": "#00A651",
  "powerpoint-to-pdf": "#FF7A00",
  "rotate-pdf": "#7C3AED",
  "organize-pdf-pages": "#7C3AED",
  "delete-pdf-pages": "#7C3AED",
  "watermark-pdf": "#7C3AED",
  "crop-pdf": "#7C3AED",
  "protect-pdf": "#4338CA",
  "unlock-pdf": "#4338CA",
  "resize-image-to-exact-kb": "#0F9FA8",
  "compress-image": "#0F9FA8",
  "background-remover": "#0F9FA8",
  "crop-image": "#0F9FA8",
  "resize-image": "#1687D8",
  "jpg-to-png": "#1687D8",
  "png-to-jpg": "#1687D8",
  "passport-photo-maker": "#2F9D5B",
  "signature-resize-tool": "#2F9D5B",
  "image-compressor-for-government-forms": "#2F9D5B",
  "ssc-photo-resize": "#2F9D5B",
  "rrb-photo-resize": "#2F9D5B",
  "ibps-photo-resize": "#2F9D5B",
  "ojas-photo-resize": "#2F9D5B",
  "gpsc-photo-resize": "#2F9D5B",
  "upsc-photo-resize": "#2F9D5B",
  "front-back-card-merge": "#2F9D5B",
};

type ToolRowTintStyle = CSSProperties & { "--tool-row-tint": string };

export function getToolRowTintStyle(slug: string): ToolRowTintStyle {
  const iconColor = toolIconColors[slug] ?? "#64748B";
  return { "--tool-row-tint": `${iconColor}14` };
}
