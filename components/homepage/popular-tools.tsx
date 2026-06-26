import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolCard } from "@/components/ToolCard";
import type { Tool } from "@/lib/tools";

export function PopularTools({ tools }: { tools: Tool[] }) {
  return (
    <section id="tools" className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Popular Tools</p>
            <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              The tools people open every single day
            </h2>
          </div>
          <Link href="/tools" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
            View all tools
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </div>
    </section>
  );
}
