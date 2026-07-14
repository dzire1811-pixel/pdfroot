"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileSearch, Search, ShieldCheck, Sparkles, UploadCloud, Workflow, Zap } from "lucide-react";
import { BrandPhrase } from "@/components/Brand";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { blogPosts } from "@/lib/blog";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { imageTools, pdfTools, tools, type Tool } from "@/lib/tools";

type FaqItem = {
  question: string;
  answer: string;
};

function ToolTile({ tool, compact = false }: { tool: Tool; compact?: boolean }) {
  return (
    <Link
      href={`/${tool.slug}`}
      style={getToolRowTintStyle(tool.slug)}
      className="group flex min-h-[8.25rem] min-w-0 flex-col rounded-lg border border-border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-[var(--tool-row-tint)] hover:shadow-md hover:shadow-foreground/5 focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]"
    >
      <ToolDirectoryIcon tool={tool} />
      <span className="mt-3 line-clamp-2 text-sm font-normal leading-snug text-foreground">{tool.name}</span>
      {!compact && <span className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground">{tool.description}</span>}
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
        Open
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = "white",
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  tone?: "white" | "muted";
}) {
  return (
    <section id={id} className={`border-b border-border ${tone === "muted" ? "bg-muted/35" : "bg-background"}`}>
      <div className="mx-auto w-full max-w-[1800px] px-6 py-10 sm:py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              <BrandPhrase text={description} styled />
            </p>
          </div>
          <Link href="/tools" className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary">
            View all tools
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}

function ToolGrid({ items, compact = false }: { items: Tool[]; compact?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
      {items.map((tool) => (
        <ToolTile key={tool.slug} tool={tool} compact={compact} />
      ))}
    </div>
  );
}

export function HomepageRedesign({ faqs }: { faqs: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const popularTools = tools.filter((tool) => tool.popular || tool.featured).slice(0, 16);
  const governmentTools = tools.filter((tool) => tool.government);

  const filteredTools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return tools
      .filter((tool) => {
        const haystack = [tool.name, tool.description, tool.category, ...tool.keywords].join(" ").toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 10);
  }, [query]);

  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid w-full max-w-[1800px] gap-8 px-6 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(23rem,0.7fr)] lg:px-8 lg:py-14">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">PDF & Image tools online</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem]">
              Fast tools for PDFs, images, photos, and form uploads
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Convert, compress, merge, split, resize, crop, and prepare files with PDFRoot. Every tool stays easy to find and opens on its own dedicated page.
            </p>

            <div className="mt-7 max-w-3xl rounded-xl border border-border bg-card p-2 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="ml-3 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  id="homepage-tool-search"
                  name="homepage-tool-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tools: merge PDF, resize image, SSC photo..."
                  className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
                  aria-label="Search PDFRoot tools"
                />
                <Link href="/tools" className="hidden rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:inline-flex">
                  Browse tools
                </Link>
              </div>
              {query.trim() && (
                <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
                  {filteredTools.length ? (
                    filteredTools.map((tool) => {
                      return (
                        <Link key={tool.slug} href={`/${tool.slug}`} style={getToolRowTintStyle(tool.slug)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--tool-row-tint)] focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]">
                          <ToolDirectoryIcon tool={tool} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-normal text-foreground">{tool.name}</span>
                            <span className="block truncate text-xs font-medium text-muted-foreground">{tool.category}</span>
                          </span>
                        </Link>
                      );
                    })
                  ) : (
                    <p className="px-3 py-2 text-sm font-medium text-muted-foreground">No matching tool found.</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {["Merge PDF", "Resize Image to Exact KB", "Compress PDF", "JPG to PDF", "Signature Resize Tool"].map((name) => {
                const tool = tools.find((item) => item.name === name);
                return tool ? (
                  <Link key={tool.slug} href={`/${tool.slug}`} style={getToolRowTintStyle(tool.slug)} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-normal text-foreground transition-colors hover:border-primary/40 hover:bg-[var(--tool-row-tint)] focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]">
                    {tool.name}
                  </Link>
                ) : null;
              })}
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-3 rounded-xl border border-border bg-muted/35 p-4">
            <div className="grid grid-cols-2 gap-3">
              {popularTools.slice(0, 8).map((tool) => (
                <ToolTile key={tool.slug} tool={tool} compact />
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionShell id="tools" eyebrow="Popular tools" title="Open the tool you need in one click" description="The homepage shows more tools at once, so common PDF and image workflows are easier to scan.">
        <ToolGrid items={popularTools} compact />
      </SectionShell>

      <SectionShell id="gov-tools" eyebrow="Government forms" title="Photo, signature, and document tools for form uploads" description="Use focused tools for exact KB images, signatures, passport photos, and front-back card preparation." tone="muted">
        <ToolGrid items={governmentTools} compact />
      </SectionShell>

      <SectionShell id="image-tools" eyebrow="Image tools" title="Resize, compress, crop, and convert images" description="Prepare JPG, PNG, WebP, photos, and signatures for documents, websites, and online forms.">
        <ToolGrid items={imageTools} compact />
      </SectionShell>

      <SectionShell id="pdf-tools" eyebrow="PDF tools" title="Convert, organize, secure, and edit PDFs" description="Merge, split, compress, convert, rotate, crop, watermark, protect, and unlock PDF files online." tone="muted">
        <ToolGrid items={pdfTools} compact />
      </SectionShell>

      <section id="showcase" className="border-b border-border bg-background">
        <div className="mx-auto grid w-full max-w-[1800px] gap-4 px-6 py-10 sm:py-12 lg:grid-cols-4 lg:px-8">
          {[
            [FileSearch, "Find tools quickly", "Search by task, file type, or form requirement."],
            [UploadCloud, "Simple upload flow", "Each tool keeps the upload, preview, action, and download steps clear."],
            [Workflow, "Separate tool pages", "Every route remains direct, shareable, and easy to return to."],
            [Zap, "Browser-friendly workflows", "Common PDF and image actions are designed for everyday file preparation."],
          ].map(([Icon, title, copy]) => {
            const CardIcon = Icon as typeof FileSearch;
            return (
              <div key={title as string} className="rounded-lg border border-border bg-card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                  <CardIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title as string}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-b border-border bg-muted/35">
        <div className="mx-auto grid w-full max-w-[1800px] gap-6 px-6 py-10 sm:py-12 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Why PDFRoot</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Built around practical file tasks</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              PDFRoot keeps PDF and image tools organized by what people need to do: convert a document, compress a file, resize an image, or prepare an upload for a form.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, "Clear categories", "PDF, image, and government-form tools are grouped separately."],
              [Sparkles, "Consistent UI", "Tool pages use familiar upload, preview, action, and download patterns."],
              [CheckCircle2, "No tool removal", "Existing tools and routes remain available from the homepage."],
            ].map(([Icon, title, copy]) => {
              const CardIcon = Icon as typeof ShieldCheck;
              return (
                <div key={title as string} className="rounded-lg border border-border bg-card p-5">
                  <CardIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{title as string}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="blog" className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-[1800px] px-6 py-10 sm:py-12 lg:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Blog</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Guides for common file tasks</h2>
            </div>
            <Link href="/blog" className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary">
              Visit blog
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            {blogPosts.slice(0, 5).map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="rounded-lg border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40">
                <p className="text-xs font-semibold text-primary">{post.category}</p>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{post.title}</h3>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{post.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-border bg-muted/35">
        <div className="mx-auto grid w-full max-w-[1800px] gap-6 px-6 py-10 sm:py-12 lg:grid-cols-[0.65fr_1.35fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">FAQ</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Quick answers</h2>
            <Link href="/faq" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              Open full FAQ
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {faqs.slice(0, 6).map((faq) => (
              <div key={faq.question} className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">
                  <BrandPhrase text={faq.question} styled />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <BrandPhrase text={faq.answer} styled />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
