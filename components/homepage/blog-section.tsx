import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { blogPosts } from "@/lib/blog";

export function BlogSection() {
  return (
    <section id="blog" className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1800px] px-6 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-[72px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Blog</p>
          <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Helpful guides for PDFs, images, and online forms
            </h2>
            <Link prefetch={false} href="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary sm:ml-auto sm:self-center">
              View all posts
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mt-[10px] grid items-stretch gap-4 md:grid-cols-3 md:[grid-auto-rows:1fr]">
          {blogPosts.slice(0, 3).map((post) => (
            <article key={post.slug} className="group flex h-full flex-col rounded-lg border border-border bg-card px-5 pb-5 pt-[26px] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-foreground/5">
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{post.category}</span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {post.date}
                </span>
              </div>
              <h3 className="blog-card-title mt-4 h-12 line-clamp-2 overflow-hidden text-xl font-bold tracking-tight text-foreground">{post.title}</h3>
              <p className="blog-card-description mt-3 h-12 line-clamp-2 overflow-hidden text-sm leading-6 text-muted-foreground">{post.description}</p>
              <Link prefetch={false} href={`/blog/${post.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-[14px] text-sm font-medium text-primary">
                Read more
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
