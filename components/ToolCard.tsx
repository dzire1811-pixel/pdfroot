import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { isToolVisibleInListings } from "@/lib/toolVisibility";
import type { Tool } from "@/lib/tools";

export function ToolCard({ tool, compact = false }: { tool: Tool; compact?: boolean }) {
  if (!isToolVisibleInListings(tool)) return null;

  return (
    <Link
      href={`/${tool.slug}`}
      style={getToolRowTintStyle(tool.slug)}
      className="group relative flex h-full min-h-[112px] flex-col rounded-lg border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-[var(--tool-row-tint)] hover:shadow-md hover:shadow-foreground/5 focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <ToolDirectoryIcon tool={tool} />
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition duration-300 group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
      </div>
      <h3 className="mt-2.5 line-clamp-2 min-h-[2.25rem] text-sm font-normal leading-[1.125rem] text-foreground">{tool.name}</h3>
      {!compact && <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{tool.description}</p>}
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open tool
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </Link>
  );
}
