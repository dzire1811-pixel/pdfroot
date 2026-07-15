import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { blogPosts, getBlogPost } from "@/lib/blog";

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

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | PDFRoot`,
      description: post.description,
      url: `https://www.pdfroot.com/blog/${post.slug}`,
      images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | PDFRoot`,
      description: post.description,
      images: ["https://www.pdfroot.com/branding/twitter-card.png"],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

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
  };

  return (
    <InfoPageLayout
      eyebrow={<><BrandText styled /> Blog</>}
      title={post.title}
      subtitle={post.description}
    >
      <article className="rounded-lg border border-border bg-card p-6 text-left sm:p-8">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground">
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
    </InfoPageLayout>
  );
}
