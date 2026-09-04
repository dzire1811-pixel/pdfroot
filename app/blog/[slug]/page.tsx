import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import "../../route-styles.css";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { BlogArticleLayout } from "@/components/blog/BlogArticleLayout";
import { BlogListingLayout } from "@/components/blog/BlogListingLayout";
import { CropImageToolArticle } from "@/components/blog/CropImageToolArticle";
import { OjasPhotoResizeArticle } from "@/components/blog/OjasPhotoResizeArticle";
import { ResizeImageExactKbArticle } from "@/components/blog/ResizeImageExactKbArticle";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { blogPosts, getBlogPost, resizeImageExactKbFaq } from "@/lib/blog";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return {
      title: "Blog Post Not Found",
    };
  }

  const canonicalUrl = post.canonicalUrl ?? `https://www.pdfroot.com/blog/${post.slug}`;
  const imageUrl = post.image ? `https://www.pdfroot.com${post.image.src}` : "https://www.pdfroot.com/branding/open-graph-image.png";
  const socialTitle = post.seoTitle ?? `${post.title} | PDFRoot`;
  const isCropImagePost = post.slug === "pdfroot-smart-crop-image-tool";

  return {
    title: post.seoTitle ? { absolute: post.seoTitle } : post.title,
    description: post.description,
    ...(post.slug === "ojas-photo-resize-student-problem" ? { authors: [{ name: post.author!, url: "https://www.pdfroot.com/about" }] } : {}),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: socialTitle,
      description: post.description,
      url: canonicalUrl,
      type: "article",
      ...(post.slug === "ojas-photo-resize-student-problem" ? { authors: [post.author!] } : {}),
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      ...(post.modifiedAt ? { modifiedTime: post.modifiedAt } : {}),
      images: [{ url: imageUrl, width: post.image?.width ?? 1200, height: post.image?.height ?? 630, alt: post.image?.alt ?? post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: post.description,
      images: [imageUrl],
    },
    ...(isCropImagePost ? {
      authors: [{ name: "Anand Joshi", url: "https://www.pdfroot.com/about" }],
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
        },
      },
    } : {}),
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

  if (post.slug === "ojas-photo-resize-student-problem") {
    const canonicalUrl = post.canonicalUrl!;
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      inLanguage: "en",
      author: { "@type": "Person", name: post.author, jobTitle: post.authorTitle },
      publisher: { "@type": "Organization", name: "PDFRoot", logo: { "@type": "ImageObject", url: "https://www.pdfroot.com/branding/logo.png" } },
      datePublished: post.publishedAt,
      dateModified: post.modifiedAt,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
      url: canonicalUrl,
      ...(post.image ? { image: `https://www.pdfroot.com${post.image.src}` } : {}),
    };
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.pdfroot.com/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.pdfroot.com/blog" },
        { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
      ],
    };
    return (
      <BlogArticleLayout
        title={post.title}
        breadcrumb={(
          <nav aria-label="Breadcrumb" className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link><span aria-hidden="true">›</span>
            <Link href="/blog" className="hover:text-foreground">Blog</Link><span aria-hidden="true">›</span>
            <span aria-current="page">OJAS Photo Resize</span>
          </nav>
        )}
      >
        <OjasPhotoResizeArticle post={post} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      </BlogArticleLayout>
    );
  }

  if (post.slug === "pdfroot-smart-crop-image-tool") {
    const canonicalUrl = "https://www.pdfroot.com/blog/pdfroot-smart-crop-image-tool";
    const imageUrl = "https://www.pdfroot.com/blog/pdfroot-crop-image-tool-a4-document.webp";
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: "PDFRoot Crop Image Tool: A Smart Solution for Online Form Photos and Documents",
      description: "Crop multiple photos, signatures and documents from one A4 page. Set dimensions, KB, rotate, flip, rename and save images with PDFRoot.",
      image: {
        "@type": "ImageObject",
        url: imageUrl,
        width: 1724,
        height: 816,
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonicalUrl,
      },
      author: {
        "@type": "Person",
        name: "Anand Joshi",
        jobTitle: "Founder of PDFRoot",
      },
      publisher: {
        "@type": "Organization",
        name: "PDFRoot",
        logo: {
          "@type": "ImageObject",
          url: "https://www.pdfroot.com/branding/logo.png",
        },
      },
      datePublished: "2026-07-25",
      dateModified: "2026-07-25",
      url: canonicalUrl,
    };

    return (
      <BlogArticleLayout
        breadcrumb={(
          <div className="flex flex-col items-center gap-4">
            <nav aria-label="Breadcrumb" className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Home</Link>
              <span aria-hidden="true">›</span>
              <Link href="/blog" className="hover:text-foreground">Blog</Link>
              <span aria-hidden="true">›</span>
              <span aria-current="page">Smart Crop Image Tool</span>
            </nav>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-muted-foreground sm:text-sm">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">Image Tools</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <time dateTime="2026-07-25">25 July 2026</time>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                {post.readTime}
              </span>
            </div>
          </div>
        )}
        title={post.title}
        subtitle={post.listingDescription}
      >
        <CropImageToolArticle />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      </BlogArticleLayout>
    );
  }

  if (post.slug === "resize-image-to-exact-kb") {
    const canonicalUrl = "https://www.pdfroot.com/blog/resize-image-to-exact-kb";
    const imageUrl = "https://www.pdfroot.com/blog/resize-image-to-exact-kb-online-pdfroot.webp";
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      author: {
        "@type": "Person",
        name: "Anand Joshi",
        jobTitle: "Founder of PDFRoot",
      },
      publisher: {
        "@type": "Organization",
        name: "PDFRoot",
        logo: {
          "@type": "ImageObject",
          url: "https://www.pdfroot.com/branding/logo.png",
        },
      },
      datePublished: "2026-07-19",
      dateModified: "2026-07-19",
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonicalUrl,
      },
      image: imageUrl,
      url: canonicalUrl,
    };
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: resizeImageExactKbFaq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    };

    return (
      <BlogArticleLayout
        breadcrumb={(
          <nav aria-label="Breadcrumb" className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <span aria-hidden="true">›</span>
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">Resize Image to Exact KB</span>
          </nav>
        )}
        title={post.title}
        subtitle={post.description}
      >
        <ResizeImageExactKbArticle />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </BlogArticleLayout>
    );
  }

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Organization",
      name: "PDFRoot",
    },
    publisher: {
      "@type": "Organization",
      name: "PDFRoot",
    },
    mainEntityOfPage: `https://www.pdfroot.com/blog/${post.slug}`,
    image: post.image ? `https://www.pdfroot.com${post.image.src}` : undefined,
  };
  const ArticlePageLayout = post.slug === "resize-image-exact-kb-government-forms" ? BlogListingLayout : InfoPageLayout;

  return (
    <ArticlePageLayout
      eyebrow={<><BrandText styled /> Blog</>}
      title={post.title}
      subtitle={post.description}
      {...(post.slug === "resize-image-exact-kb-government-forms" ? { alignPaddedArticleImage: true } : {})}
    >
      <article className="rounded-lg border border-border bg-card p-6 text-left sm:p-8">
        {post.image ? (
          <Image
            src={post.image.src}
            alt={post.image.alt}
            width={1200}
            height={630}
            priority
            className="h-auto w-full rounded-lg border border-border object-contain"
            sizes="(max-width: 768px) calc(100vw - 5rem), 832px"
          />
        ) : null}

        <div className={`flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground ${post.image ? "mt-6" : ""}`}>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{post.category}</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {post.date}
          </span>
          <span>{post.readTime}</span>
        </div>

        <p className="mt-7 text-lg leading-8 text-muted-foreground">{post.content.intro}</p>

        <div className="mt-8 space-y-7">
          {post.content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{section.heading}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to blog
          </Link>
          {post.relatedTool ? (
            <Link href={post.relatedTool.href} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
              {post.relatedTool.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema),
        }}
      />
    </ArticlePageLayout>
  );
}
