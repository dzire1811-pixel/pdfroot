import { FileCheck2, LockKeyhole, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { SectionHeading } from "@/components/Brand";

const features = [
  {
    title: "Browser-based core tools",
    description: "Core PDF and image workflows process selected files in the browser.",
    icon: LockKeyhole,
  },
  {
    title: "Focused PDF & Image Tools",
    icon: Zap,
  },
  {
    title: "Use on Mobile & Desktop",
    icon: Smartphone,
  },
  {
    title: "Prepare files for forms and uploads",
    icon: FileCheck2,
  },
  {
    title: "Check each tool's privacy note",
    description: "Some optional features use a third-party service and say so before processing begins.",
    icon: ShieldCheck,
  },
];

export function WhyChoosePdfRoot() {
  return (
    <section className="border-t border-border bg-muted/40 px-6 py-14 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <SectionHeading
          eyebrow="Why Choose PDFRoot?"
          title="Built for everyday PDF and image work"
          description="Simple, fast, and mobile-friendly tools for documents, forms, photos, and uploads."
        />
        <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div key={feature.title} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-foreground">{feature.title}</h3>
                {feature.description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
