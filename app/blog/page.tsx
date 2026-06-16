import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";

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
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              <BrandText /> Blog
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              Simple PDF and Image Guides
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Short guides for file conversion, compression, exact KB image resize, and government form document preparation.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.title}
                className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_24px_70px_rgba(255,45,45,0.12)]"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                  <BookOpen className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{post.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{post.description}</p>
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  This short <BrandText /> guide will help you choose the right file workflow. Use the button below when you are ready to open the actual tool.
                </div>
                <Link href={post.href} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-red-600">
                  {post.cta}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
