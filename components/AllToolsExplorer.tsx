"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ToolCard } from "@/components/ToolCard";
import { pdfTools, imageTools, tools } from "@/lib/tools";

type Filter = "All Tools" | "Popular Tools" | "PDF Tools" | "Image Tools" | "Government Form Tools";

const filters: Filter[] = ["All Tools", "Popular Tools", "PDF Tools", "Image Tools", "Government Form Tools"];

const aliases: Record<string, string[]> = {
  "front-back-card-merge": ["aadhaar", "aadhar", "pan", "voter", "driving licence", "driving license", "rc book", "passport card", "atm card", "employee id", "student id"],
  "signature-resize-tool": ["signature kb", "sign resize", "20kb signature", "50kb signature"],
  "resize-image-to-exact-kb": ["exact kb", "20kb", "50kb", "100kb", "photo kb", "government form photo"],
  "ssc-photo-resize": ["ssc helper", "ssc signature", "ssc signature 10kb", "ssc signature 20kb"],
  "rrb-photo-resize": ["rrb helper", "railway signature", "rrb signature 30kb", "rrb signature 49kb"],
  "ibps-photo-resize": ["ibps helper", "thumb impression", "handwritten declaration", "ibps declaration", "ibps thumb"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
}

function matchesSearch(tool: (typeof tools)[number], query: string) {
  if (!query) return true;
  if (query === "pdf" && tool.category === "PDF Tools") return true;

  const haystack = normalize([tool.name, tool.description, tool.category, tool.slug, ...tool.keywords, ...(aliases[tool.slug] ?? [])].join(" "));
  return haystack.includes(query);
}

function filterTools(filter: Filter) {
  if (filter === "Popular Tools") return tools.filter((tool) => tool.popular);
  if (filter === "PDF Tools") return pdfTools;
  if (filter === "Image Tools") return imageTools;
  if (filter === "Government Form Tools") return tools.filter((tool) => tool.government);
  return tools;
}

export function AllToolsExplorer() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("All Tools");
  const normalizedQuery = normalize(query);
  const hasSearchQuery = Boolean(normalizedQuery);

  const filteredTools = useMemo(() => {
    const sourceTools = normalizedQuery ? tools : filterTools(activeFilter);
    return sourceTools.filter((tool) => matchesSearch(tool, normalizedQuery));
  }, [activeFilter, normalizedQuery]);

  function onSearchChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  return (
    <section className="px-6 py-12 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-h-[58px] flex-1 items-center gap-3 rounded-xl border border-border bg-background px-4">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="relative min-w-0 flex-1">
                {!query ? (
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm font-medium text-muted-foreground">
                    Search all PDFRoot tools
                  </span>
                ) : null}
                <input
                  id="all-tools-search"
                  name="all-tools-search"
                  value={query}
                  onChange={onSearchChange}
                  className="relative z-10 w-full bg-transparent py-4 text-sm font-medium text-foreground outline-none"
                  aria-label="Search all PDFRoot tools"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    activeFilter === filter
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          {hasSearchQuery && (
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                  {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
                </p>
                <p className="hidden text-sm font-medium text-muted-foreground sm:block">Click any tool card to open it.</p>
              </div>
              {filteredTools.length > 0 ? (
                <div className={`mt-4 grid gap-4 ${filteredTools.length === 1 ? "max-w-sm grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-border bg-muted/40 px-6 py-10 text-center">
                  <p className="text-lg font-semibold text-foreground">No tool found</p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">Try searching by tool name, file type, or government form keyword.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {!hasSearchQuery && (
          <div className="relative z-10 mt-8 flex items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
            </p>
            <p className="hidden text-sm font-medium text-muted-foreground sm:block">Click any tool card to open it.</p>
          </div>
        )}

        {!hasSearchQuery && filteredTools.length > 0 ? (
          <div className={`relative z-10 mt-4 grid gap-4 ${filteredTools.length === 1 ? "max-w-sm grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
            {filteredTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        ) : !hasSearchQuery ? (
          <div className="mt-6 rounded-2xl border border-border bg-muted/40 px-6 py-14 text-center">
            <p className="text-lg font-semibold text-foreground">No tool found</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">Try searching by tool name, file type, or government form keyword.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
