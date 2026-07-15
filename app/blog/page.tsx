import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { blogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Read PDFRoot guides about resizing images to exact KB, converting JPG to PDF, compressing PDFs, government form photos, and useful PDF tools.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Blog | PDFRoot",
    description: "Simple guides for PDF tools, image tools, exact KB resize, and government form file preparation.",
    url: "https://pdfroot.com/blog",
    images: ["https://pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | PDFRoot",
    description: "Simple guides for PDF tools, image tools, exact KB resize, and government form file preparation.",
    images: ["https://pdfroot.com/branding/twitter-card.png"],
  },
};

export default function BlogPage() {
  return (
    <InfoPageLayout
      eyebrow={<><BrandText styled /> Blog</>}
      title="PDF and Image Tool Guides"
      subtitle="SEO-friendly, practical guides for file conversion, compression, exact KB image resizing, and online form preparation."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {blogPosts.map((post) => (
          <article key={post.slug} className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-foreground/5">
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{post.category}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {post.date}
              </span>
              <span>{post.readTime}</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">{post.title}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{post.description}</p>
            <Link href={`/blog/${post.slug}`} className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-primary">
              Read more
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </InfoPageLayout>
  );
}
