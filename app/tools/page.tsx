import type { Metadata } from "next";
import { ToolsDirectoryPage } from "@/components/ToolsDirectoryPage";

export const metadata: Metadata = {
  title: "All PDF & Image Tools",
  description:
    "Browse all PDFRoot PDF tools, image tools, popular tools, and government form tools. Search by tool name, file type, or keyword.",
  alternates: {
    canonical: "/tools",
  },
  openGraph: {
    title: "All PDF & Image Tools | PDFRoot",
    description: "Search and browse all PDFRoot tools for PDFs, images, exact KB resize, government forms, and document workflows.",
    url: "https://pdfroot.com/tools",
    images: ["https://pdfroot.com/branding/open-graph-image.png"],
  },
};

export default function ToolsPage() {
  return <ToolsDirectoryPage />;
}
