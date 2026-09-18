"use client";

import Link from "next/link";
import { useState } from "react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { ToolFeedback } from "@/components/ToolFeedback";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { MergeResultExploreButton } from "@/components/MergeResultExploreButton";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { getToolBySlug, imageTools, pdfTools, tools } from "@/lib/tools";
import { ToolRenderer } from "@/components/ToolRenderer";

const resultPrimaryActions = [
  ["merge-pdf", "Merge PDF", "Combine PDF files into one document."],
  ["split-pdf", "Split PDF", "Extract or separate PDF pages."],
] as const;

const resultSecondaryTools = ["pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint"].flatMap((slug) => {
  const tool = getToolBySlug(slug);
  return tool ? [tool] : [];
});

function EditPdfResultSections() {
  const primaryActions = resultPrimaryActions.flatMap(([slug, label, description]) => {
    const tool = getToolBySlug(slug);
    return tool ? [{ tool, label, description }] : [];
  });

  return <>
    <ToolFeedback toolName="Edit PDF" toolSlug="edit-pdf" />
    <section data-edit-pdf-result-only="next-actions" className="h-auto overflow-visible bg-muted/40 px-4 pb-2 pt-2 sm:px-6 lg:px-8">
      <div className="mx-auto h-auto max-w-[1040px] overflow-visible rounded-2xl border border-border bg-card px-4 py-4 shadow-sm shadow-foreground/[0.03] sm:px-5">
        <h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground">What would you like to do next?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {primaryActions.map(({ tool, label, description }) => <Link key={tool.slug} href={`/${tool.slug}`} style={getToolRowTintStyle(tool.slug)} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3 transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-[var(--tool-row-tint)]">
            <span className="shrink-0"><ToolDirectoryIcon tool={tool} /></span>
            <span className="min-w-0"><span className="block text-sm font-normal leading-tight text-foreground">{label}</span><span className="mt-1 block text-xs leading-snug text-muted-foreground">{description}</span></span>
          </Link>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2.5">
          {resultSecondaryTools.map((tool) => <Link key={tool.slug} href={`/${tool.slug}`} style={getToolRowTintStyle(tool.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-normal text-foreground transition-[background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-[var(--tool-row-tint)]">
            <ToolDirectoryIcon tool={tool} />{tool.name}
          </Link>)}
        </div>
        <div className="mt-4 flex justify-center"><MergeResultExploreButton category="PDF Tools" /></div>
      </div>
    </section>
    <WhyChoosePdfRoot />
  </>;
}

export function EditPdfPage() {
  const [editorActive, setEditorActive] = useState(false);
  const [resultActive, setResultActive] = useState(false);
  return <div className="min-h-screen bg-background text-foreground"><HomepageSiteHeader /><main><ToolRenderer slug="edit-pdf" name="Edit PDF Online" description="Add text, images and signatures to your PDF." onEditPdfEditorActiveChange={setEditorActive} onEditPdfResultActiveChange={setResultActive} />{resultActive && <EditPdfResultSections />}</main>{!editorActive && <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={tools.filter(tool => tool.government)} />}</div>;
}
