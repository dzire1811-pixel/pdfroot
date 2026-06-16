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
  "ssc-photo-resize": ["ssc helper", "ssc signature"],
  "rrb-photo-resize": ["rrb helper", "railway photo"],
  "ibps-photo-resize": ["ibps helper", "thumb impression", "handwritten declaration"],
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
    <section className="px-5 py-12 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-h-[58px] flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={onSearchChange}
                className="min-w-0 flex-1 bg-transparent py-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Search all PDFRoot tools"
                aria-label="Search all PDFRoot tools"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full border px-4 py-2.5 text-sm font-black transition ${
                    activeFilter === filter
                      ? "border-[#FF2D2D] bg-[#FF2D2D] text-white shadow-[0_12px_28px_rgba(255,45,45,0.22)]"
                      : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-[#FF2D2D]"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          {hasSearchQuery && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
                  {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
                </p>
                <p className="hidden text-sm font-semibold text-slate-500 sm:block">Click any tool card to open it.</p>
              </div>
              {filteredTools.length > 0 ? (
                <div className={`mt-4 grid gap-4 ${filteredTools.length === 1 ? "max-w-sm grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
                  {filteredTools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[2rem] border border-slate-200 bg-slate-50 px-6 py-10 text-center">
                  <p className="text-lg font-black text-slate-950">No tool found</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">Try searching by tool name, file type, or government form keyword.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {!hasSearchQuery && (
          <div className="relative z-10 mt-8 flex items-center justify-between gap-4">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
              {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
            </p>
            <p className="hidden text-sm font-semibold text-slate-500 sm:block">Click any tool card to open it.</p>
          </div>
        )}

        {!hasSearchQuery && filteredTools.length > 0 ? (
          <div className={`relative z-10 mt-4 grid gap-4 ${filteredTools.length === 1 ? "max-w-sm grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
            {filteredTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        ) : !hasSearchQuery ? (
          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 px-6 py-14 text-center">
            <p className="text-lg font-black text-slate-950">No tool found</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Try searching by tool name, file type, or government form keyword.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
