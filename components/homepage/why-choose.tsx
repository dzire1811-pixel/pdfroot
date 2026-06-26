import { FileCheck2, Lock, Smartphone, Zap } from "lucide-react";
import { BrandText } from "@/components/Brand";

const reasons = [
  {
    title: "Fast Processing",
    desc: "Optimized engines convert and compress files in seconds, even on slow connections.",
    icon: Zap,
  },
  {
    title: "Privacy First",
    desc: "Files are processed securely over SSL and automatically deleted within one hour.",
    icon: Lock,
  },
  {
    title: "Mobile Friendly",
    desc: "Every tool is built mobile-first, so it works perfectly from any phone or tablet.",
    icon: Smartphone,
  },
  {
    title: "Government Form Ready",
    desc: "Exact KB sizing and photo presets tuned for SSC, RRB, UPSC, IBPS and more.",
    icon: FileCheck2,
  },
];

export function WhyChoose() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Why <BrandText styled />
          </p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why choose <BrandText styled />
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((reason) => (
            <div key={reason.title} className="flex flex-col rounded-2xl border border-border bg-card p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <reason.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-foreground">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{reason.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
