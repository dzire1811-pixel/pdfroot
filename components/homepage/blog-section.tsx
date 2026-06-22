import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { blogPosts } from "@/lib/blog";

export function BlogSection() {
  return (
    <section id="blog" className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Blog</p>
            <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Helpful guides for PDFs, images, and online forms
            </h2>
          </div>
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
            View all posts
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {blogPosts.slice(0, 3).map((post) => (
            <article key={post.slug} className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-foreground/5">
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{post.category}</span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {post.date}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">{post.title}</h3>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{post.description}</p>
              <Link href={`/blog/${post.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-primary">
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
