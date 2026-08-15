"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { filterVisibleTools } from "@/lib/toolVisibility";
import { tools } from "@/lib/tools";

const visibleTools = filterVisibleTools(tools);

const aliases: Record<string, string[]> = {
  "front-back-card-merge": ["aadhaar", "aadhar", "pan", "voter", "driving licence", "driving license", "rc book", "atm", "id card", "card merge", "front back"],
  "signature-resize-tool": ["kb", "20kb", "50kb", "sign", "signature kb"],
  "resize-image-to-exact-kb": ["kb", "exact kb", "photo kb", "image kb", "government form"],
  "ssc-photo-resize": ["ssc helper", "ssc signature", "ssc signature 10kb", "ssc signature 20kb"],
  "rrb-signature-resize": ["rrb helper", "railway", "rrb signature", "rrb signature 30kb", "rrb signature 49kb"],
  "ibps-photo-resize": ["ibps helper", "banking", "thumb impression", "handwritten declaration", "ibps declaration", "ibps thumb"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
}

function getHaystack(tool: (typeof tools)[number]) {
  return normalize([tool.name, tool.description, tool.category, tool.slug, ...tool.keywords, ...(aliases[tool.slug] ?? [])].join(" "));
}

function scoreTool(tool: (typeof tools)[number], query: string) {
  const name = normalize(tool.name);
  const haystack = getHaystack(tool);

  if (query === "pdf" && tool.category === "PDF Tools") return 100;
  if (name === query) return 90;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 70;
  if (tool.keywords.some((keyword) => normalize(keyword).includes(query))) return 60;
  if ((aliases[tool.slug] ?? []).some((alias) => normalize(alias).includes(query))) return 55;
  if (haystack.includes(query)) return 40;
  return 0;
}

export function ToolSearch() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    return visibleTools
      .map((tool) => ({ tool, score: scoreTool(tool, normalizedQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, normalizedQuery === "pdf" ? 30 : 8)
      .map((item) => item.tool);
  }, [query]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setIsOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      setIsOpen(false);
      router.push(`/${results[0].slug}`);
    }
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative mx-auto mt-7 max-w-2xl lg:mx-0">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <Search className="ml-3 h-5 w-5 text-slate-400" aria-hidden="true" />
        <input
          id="tool-search-input"
          name="tool-search-input"
          value={query}
          onChange={onChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-500/80"
          placeholder="Search PDF and Image Tools"
          aria-label="Search PDF and Image Tools"
        />
      </div>

      {isOpen && query.trim() && (
        <div id="tool-search-results" className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
          {results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto p-2">
              {results.map((tool) => {
                return (
                  <Link
                    key={tool.slug}
                    href={`/${tool.slug}`}
                    onClick={() => setIsOpen(false)}
                    style={getToolRowTintStyle(tool.slug)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[var(--tool-row-tint)] focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]"
                  >
                    <ToolDirectoryIcon tool={tool} />
                    <span className="min-w-0">
                      <span className="block text-sm font-normal text-slate-950">{tool.name}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-5 text-slate-600">{tool.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-5 text-sm font-bold text-slate-500">No tool found</div>
          )}
        </div>
      )}
    </div>
  );
}
