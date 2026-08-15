import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "../route-styles.css";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import { BlogListingLayout } from "@/components/blog/BlogListingLayout";
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
    url: "https://www.pdfroot.com/blog",
    images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | PDFRoot",
    description: "Simple guides for PDF tools, image tools, exact KB resize, and government form file preparation.",
    images: ["https://www.pdfroot.com/branding/twitter-card.png"],
  },
};

export default function BlogPage() {
  return (
    <BlogListingLayout
      eyebrow={<><BrandText styled /> Blog</>}
      title="PDF and Image Tool Guides"
      subtitle="SEO-friendly, practical guides for file conversion, compression, exact KB image resizing, and online form preparation."
    >
      <div className="grid items-stretch gap-5 sm:grid-cols-2">
        {blogPosts.map((post) => {
          const isCropImagePost = post.slug === "pdfroot-smart-crop-image-tool";
          const cardTitle = post.listingTitle ?? post.title;
          const cardDescription = post.listingDescription ?? post.description;
          const featuredImage = post.image ?? (post.slug === "resize-image-exact-kb-government-forms" ? {
            src: "/blog/government-form-photo-signature-resize-guide.webp",
            alt: "Government form photo and signature resizing guide",
            width: 1200,
            height: 630,
          } : undefined);
          const publicationDate = post.publishedAt
            ? { dateTime: post.publishedAt, label: post.date }
            : post.slug === "resize-image-to-exact-kb"
            ? { dateTime: "2026-07-19", label: "19 July 2026" }
            : { dateTime: "2026-06-22", label: "22 June 2026" };

          return (
            <article key={post.slug} className={`group flex h-full flex-col border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-foreground/5 ${isCropImagePost ? "rounded-xl p-5 sm:p-6" : "rounded-lg p-6"}`}>
              {featuredImage ? (
                <Link
                  href={`/blog/${post.slug}`}
                  className={isCropImagePost ? "mb-5 block overflow-hidden rounded-xl border border-border bg-white p-2 shadow-sm sm:p-3" : "mb-5 block aspect-[40/21] overflow-hidden rounded-lg border border-border"}
                  aria-label={`Read ${cardTitle}`}
                >
                  <Image
                    src={featuredImage.src}
                    alt={featuredImage.alt}
                    width={featuredImage.width ?? 1200}
                    height={featuredImage.height ?? 630}
                    className={isCropImagePost ? "h-auto w-full rounded-lg border border-border object-contain transition duration-300 group-hover:scale-[1.01]" : "h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"}
                    sizes="(max-width: 640px) calc(100vw - 4rem), 420px"
                  />
                </Link>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{post.category}</span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  <time dateTime={publicationDate.dateTime}>{publicationDate.label}</time>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {post.readTime}
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
                {isCropImagePost ? <BrandPhrase text={cardTitle} styled /> : cardTitle}
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {isCropImagePost ? <BrandPhrase text={cardDescription} styled /> : cardDescription}
              </p>
              <Link href={`/blog/${post.slug}`} className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-primary">
                Read Article
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </BlogListingLayout>
  );
}
