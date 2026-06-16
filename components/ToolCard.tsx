import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Tool } from "@/lib/tools";

export function ToolCard({ tool, compact = false }: { tool: Tool; compact?: boolean }) {
  const Icon = tool.icon;

  return (
    <Link
      href={`/${tool.slug}`}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_18px_45px_rgba(255,45,45,0.11)]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D] transition duration-300 group-hover:scale-105 group-hover:bg-[#FF2D2D] group-hover:text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight className="mt-2 h-4 w-4 text-slate-300 transition duration-300 group-hover:translate-x-1 group-hover:text-[#FF2D2D]" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-base font-black text-slate-950">{tool.name}</h3>
      {!compact && <p className="mt-2 text-sm leading-6 text-slate-600">{tool.description}</p>}
    </Link>
  );
}
