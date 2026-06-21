import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Read simple PDFRoot guides about resizing images to exact KB, converting JPG to PDF, compressing PDFs, preparing government form photos, and using PDF and image tools.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Blog | PDFRoot",
    description: "Simple guides for PDF tools, image tools, exact KB resize, and government form file preparation.",
    url: "https://pdfroot.com/blog",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | PDFRoot",
    description: "Simple guides for PDF tools, image tools, exact KB resize, and government form file preparation.",
    images: ["/pdfroot-og-image.png"],
  },
};

const posts = [
  {
    title: "How to Resize Image to Exact KB Online",
    description:
      "Learn how to resize photos and images to 20KB, 50KB, 100KB, or a custom file size for forms and uploads.",
    href: "/resize-image-to-exact-kb",
    cta: "Use Resize Image Tool",
  },
  {
    title: "How to Convert JPG to PDF Online",
    description:
      "Convert one or multiple JPG images into a single PDF file using a simple browser-based workflow.",
    href: "/jpg-to-pdf",
    cta: "Use JPG to PDF Tool",
  },
  {
    title: "How to Compress PDF File Size",
    description:
      "Reduce PDF file size for email, online forms, office work, and document sharing while keeping the file usable.",
    href: "/compress-pdf",
    cta: "Use Compress PDF Tool",
  },
  {
    title: "How to Resize Photo and Signature for Government Forms",
    description:
      "Prepare photos and signatures for recruitment, admission, scholarship, and online application forms.",
    href: "/signature-resize-tool",
    cta: "Use Signature Resize Tool",
  },
  {
    title: "Best Free PDF and Image Tools for Students",
    description:
      "Explore helpful PDF and image tools for school, college, cyber cafe work, exam forms, and everyday documents.",
    href: "/tools",
    cta: "Browse All Tools",
  },
];

export default function BlogPage() {
  return (
    <InfoPageLayout
      eyebrow={<><BrandText styled /> Blog</>}
      title="Simple PDF and Image Guides"
      subtitle="Short guides for file conversion, compression, exact KB image resize, and government form document preparation."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {posts.map((post) => (
          <article key={post.title} className="group rounded-2xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-foreground/5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">{post.title}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{post.description}</p>
            <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
              This short <BrandText styled /> guide will help you choose the right file workflow. Use the button below when you are ready to open the actual tool.
            </div>
            <Link href={post.href} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90">
              {post.cta}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </InfoPageLayout>
  );
}
