import { SectionHeading } from "@/components/Brand";
import { ToolCard } from "@/components/ToolCard";
import { ToolGuideContent } from "@/components/ToolGuideContent";
import { getToolBySlug } from "@/lib/tools";

const relatedPdfTools = ["merge-pdf", "compress-pdf", "split-pdf", "pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint"].flatMap((slug) => {
  const tool = getToolBySlug(slug);
  return tool ? [tool] : [];
});

export function EditPdfLandingSections() {
  return <>
    <ToolGuideContent slug="edit-pdf" name="Edit PDF Online" />
    <section data-tool-page-extra="related" className="bg-background px-6 py-14 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <SectionHeading eyebrow="Related Tools" title="More PDF Tools" description="Continue working with other PDFRoot tools for your PDF documents." />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {relatedPdfTools.map((tool) => <ToolCard key={tool.slug} tool={tool} compact />)}
        </div>
      </div>
    </section>
  </>;
}
