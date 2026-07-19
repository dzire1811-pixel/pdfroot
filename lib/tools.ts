export type ToolCategory = "PDF Tools" | "Image Tools";

export type Tool = {
  name: string;
  slug: string;
  category: ToolCategory;
  description: string;
  keywords: string[];
  popular?: boolean;
  featured?: boolean;
  conversion?: boolean;
  government?: boolean;
};

export const pdfTools: Tool[] = [
  {
    name: "Merge PDF",
    slug: "merge-pdf",
    category: "PDF Tools",
    description: "Combine multiple PDF files into one organized document.",
    keywords: ["merge pdf", "combine pdf", "join pdf files"],
    popular: true,
  },
  {
    name: "Split PDF",
    slug: "split-pdf",
    category: "PDF Tools",
    description: "Split a PDF into separate files or extract selected page ranges.",
    keywords: ["split pdf", "separate pdf pages", "extract pdf"],
    popular: true,
  },
  {
    name: "Compress PDF",
    slug: "compress-pdf",
    category: "PDF Tools",
    description: "Reduce PDF file size for email, portals, and document upload limits.",
    keywords: ["compress pdf", "reduce pdf size", "pdf compressor"],
    popular: true,
  },
  {
    name: "PDF to Word",
    slug: "pdf-to-word",
    category: "PDF Tools",
    description: "Convert PDF documents into editable Word files.",
    keywords: ["pdf to word", "convert pdf to docx"],
    conversion: true,
  },
  {
    name: "PDF to Excel",
    slug: "pdf-to-excel",
    category: "PDF Tools",
    description: "Convert tables and data from PDF into spreadsheet-friendly Excel files.",
    keywords: ["pdf to excel", "extract tables from pdf"],
    conversion: true,
  },
  {
    name: "PDF to PowerPoint",
    slug: "pdf-to-powerpoint",
    category: "PDF Tools",
    description: "Turn PDF pages into presentation-ready PowerPoint slides.",
    keywords: ["pdf to powerpoint", "pdf to ppt"],
    conversion: true,
  },
  {
    name: "PDF to JPG",
    slug: "pdf-to-jpg",
    category: "PDF Tools",
    description: "Convert PDF pages into clear JPG images.",
    keywords: ["pdf to jpg", "convert pdf to image"],
    popular: true,
    conversion: true,
  },
  {
    name: "JPG to PDF",
    slug: "jpg-to-pdf",
    category: "PDF Tools",
    description: "Create a clean PDF from JPG images in seconds.",
    keywords: ["jpg to pdf", "image to pdf", "photo to pdf"],
    popular: true,
    conversion: true,
  },
  {
    name: "PNG to PDF",
    slug: "png-to-pdf",
    category: "PDF Tools",
    description: "Convert PNG images into a downloadable PDF document.",
    keywords: ["png to pdf", "convert png to pdf"],
    conversion: true,
  },
  {
    name: "Word to PDF",
    slug: "word-to-pdf",
    category: "PDF Tools",
    description: "Turn Word documents into polished PDF files.",
    keywords: ["word to pdf", "docx to pdf"],
    conversion: true,
  },
  {
    name: "Excel to PDF",
    slug: "excel-to-pdf",
    category: "PDF Tools",
    description: "Convert spreadsheets to PDF for sharing and submission.",
    keywords: ["excel to pdf", "xlsx to pdf"],
    conversion: true,
  },
  {
    name: "PowerPoint to PDF",
    slug: "powerpoint-to-pdf",
    category: "PDF Tools",
    description: "Export presentation slides as a compact PDF.",
    keywords: ["powerpoint to pdf", "ppt to pdf"],
    conversion: true,
  },
  {
    name: "Rotate PDF",
    slug: "rotate-pdf",
    category: "PDF Tools",
    description: "Rotate PDF pages left or right and fix page orientation.",
    keywords: ["rotate pdf", "fix pdf orientation"],
  },
  {
    name: "Organize PDF Pages",
    slug: "organize-pdf-pages",
    category: "PDF Tools",
    description: "Reorder, sort, and manage pages inside a PDF.",
    keywords: ["organize pdf", "reorder pdf pages"],
  },
  {
    name: "Delete PDF Pages",
    slug: "delete-pdf-pages",
    category: "PDF Tools",
    description: "Remove unwanted pages from a PDF document.",
    keywords: ["delete pdf pages", "remove pages from pdf"],
  },
  {
    name: "Watermark PDF",
    slug: "watermark-pdf",
    category: "PDF Tools",
    description: "Add text or image watermarks to PDF files.",
    keywords: ["watermark pdf", "add watermark to pdf"],
  },
  {
    name: "Crop PDF",
    slug: "crop-pdf",
    category: "PDF Tools",
    description: "Crop PDF pages to remove extra margins and clean document layout.",
    keywords: ["crop pdf", "remove pdf margins", "crop pdf online"],
  },
  {
    name: "Protect PDF",
    slug: "protect-pdf",
    category: "PDF Tools",
    description: "Secure a PDF with password protection.",
    keywords: ["protect pdf", "password protect pdf"],
  },
  {
    name: "Unlock PDF",
    slug: "unlock-pdf",
    category: "PDF Tools",
    description: "Remove supported PDF restrictions when you have permission.",
    keywords: ["unlock pdf", "remove pdf password"],
  },
];

export const imageTools: Tool[] = [
  {
    name: "Resize Image to Exact KB",
    slug: "resize-image-to-exact-kb",
    category: "Image Tools",
    description: "Resize images to 20KB, 50KB, 100KB, 200KB, or a custom exact size.",
    keywords: ["resize image to exact kb", "photo resize for recruitment form"],
    popular: true,
    featured: true,
    government: true,
  },
  {
    name: "Compress Image",
    slug: "compress-image",
    category: "Image Tools",
    description: "Compress JPG, PNG, and WebP images without complicated settings.",
    keywords: ["compress image", "image compressor", "reduce image size"],
    popular: true,
  },
  {
    name: "Background Remover",
    slug: "background-remover",
    category: "Image Tools",
    description: "Remove image backgrounds online and download transparent PNG files.",
    keywords: ["background remover", "remove background", "transparent png", "image background remover"],
    popular: true,
  },
  {
    name: "Crop Image",
    slug: "crop-image",
    category: "Image Tools",
    description: "Crop photos for forms, profiles, documents, and web uploads.",
    keywords: ["crop image", "photo crop online"],
  },
  {
    name: "Resize Image",
    slug: "resize-image",
    category: "Image Tools",
    description: "Resize image width and height for uploads, documents, and websites.",
    keywords: ["resize image", "change image dimensions"],
  },
  {
    name: "JPG to PNG",
    slug: "jpg-to-png",
    category: "Image Tools",
    description: "Convert JPG photos into PNG images.",
    keywords: ["jpg to png", "convert jpg to png"],
  },
  {
    name: "PNG to JPG",
    slug: "png-to-jpg",
    category: "Image Tools",
    description: "Convert PNG images into JPG format.",
    keywords: ["png to jpg", "convert png to jpg"],
  },
  {
    name: "Passport Photo Maker",
    slug: "passport-photo-maker",
    category: "Image Tools",
    description: "Prepare passport-style photos for applications and official forms.",
    keywords: ["passport photo maker", "passport photo online"],
    government: true,
  },
  {
    name: "Signature Resize Tool",
    slug: "signature-resize-tool",
    category: "Image Tools",
    description: "Resize scanned signatures to exact KB limits for online forms.",
    keywords: ["signature resize online", "resize signature to 20kb"],
    popular: true,
    government: true,
  },
  {
    name: "Image Compressor for Government Forms",
    slug: "image-compressor-for-government-forms",
    category: "Image Tools",
    description: "Compress photos and signatures for recruitment, scholarship, and admission forms.",
    keywords: ["government form photo resize", "ssc photo resize", "ojas photo resize"],
    government: true,
  },
  {
    name: "SSC Signature Resize Tool",
    slug: "ssc-photo-resize",
    category: "Image Tools",
    description: "Resize SSC signatures to JPG/JPEG, 10-20 KB, and 6.0 cm x 2.0 cm requirements.",
    keywords: ["ssc signature resize", "resize signature for ssc", "ssc signature 10kb 20kb", "ssc signature 6x2 cm"],
    government: true,
  },
  {
    name: "RRB Signature Resize",
    slug: "rrb-signature-resize",
    category: "Image Tools",
    description: "Resize RRB signatures to JPG/JPEG, 30-49 KB, minimum 140 x 60 px, and 100 DPI requirements.",
    keywords: ["rrb signature resize", "railway signature resize", "rrb signature 30kb 49kb", "rrb signature 140x60"],
    government: true,
  },
  {
    name: "IBPS Photo, Signature, Thumb & Declaration Resize",
    slug: "ibps-photo-resize",
    category: "Image Tools",
    description: "Resize IBPS photo, signature, left thumb impression, and handwritten declaration documents to required JPG/JPEG dimensions and file sizes.",
    keywords: ["ibps photo resize", "ibps signature resize", "ibps thumb impression resize", "ibps handwritten declaration resize"],
    government: true,
  },
  {
    name: "OJAS Photo Resize",
    slug: "ojas-photo-resize",
    category: "Image Tools",
    description: "Resize photos and signatures for OJAS Gujarat recruitment forms.",
    keywords: ["ojas photo resize", "ojas signature resize", "gujarat form photo resize"],
    government: true,
  },
  {
    name: "GPSC Photo Resize Online",
    slug: "gpsc-photo-resize",
    category: "Image Tools",
    description: "Prepare GPSC form photos and signatures at the required file size.",
    keywords: ["gpsc photo resize", "gpsc signature resize", "gpsc form photo"],
    government: true,
  },
  {
    name: "UPSC Photo Resize",
    slug: "upsc-photo-resize",
    category: "Image Tools",
    description: "Resize UPSC application photos and signature images online.",
    keywords: ["upsc photo resize", "upsc signature resize", "upsc form image resize"],
    government: true,
  },
  {
    name: "Front & Back Card Merge",
    slug: "front-back-card-merge",
    category: "Image Tools",
    description: "Merge Aadhaar, PAN, Voter ID, Driving Licence or any card front and back into one image or PDF.",
    keywords: ["front back card merge", "aadhaar card front back merge", "pan card front back", "document card merge"],
    popular: true,
    government: true,
  },
];

export const tools = [...pdfTools, ...imageTools];

export const popularQuickActions = [
  { label: "Photo to 20KB", slug: "resize-image-to-exact-kb" },
  { label: "Photo to 50KB", slug: "resize-image-to-exact-kb" },
  { label: "Photo to 100KB", slug: "resize-image-to-exact-kb" },
  { label: "Signature to 20KB", slug: "signature-resize-tool" },
  { label: "Signature to 50KB", slug: "signature-resize-tool" },
  { label: "JPG to PDF", slug: "jpg-to-pdf" },
  { label: "PDF to JPG", slug: "pdf-to-jpg" },
  { label: "Merge PDF", slug: "merge-pdf" },
  { label: "Compress PDF", slug: "compress-pdf" },
];

export const recruitmentPlatforms = [
  "SSC",
  "RRB",
  "IBPS",
  "OJAS",
  "UPSC",
  "GPSC",
  "Railway",
  "Police Recruitment",
  "Banking Exams",
  "Scholarship Forms",
];

export const features = [
  "Drag & Drop Upload",
  "Mobile Responsive",
  "Fast Processing",
  "Secure Files",
  "No Registration Required",
  "Batch Processing",
  "Modern SaaS UI",
];

export function getToolBySlug(slug: string) {
  return tools.find((tool) => tool.slug === slug);
}
