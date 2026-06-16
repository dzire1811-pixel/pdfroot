import { FileCheck2, LockKeyhole, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { SectionHeading } from "@/components/Brand";

const features = [
  {
    title: "Files Processed Locally",
    icon: LockKeyhole,
  },
  {
    title: "Fast & Free PDF & Image Tools",
    icon: Zap,
  },
  {
    title: "Works on Mobile & Desktop",
    icon: Smartphone,
  },
  {
    title: "Perfect for Government Forms & Document Uploads",
    icon: FileCheck2,
  },
  {
    title: "Secure File Processing",
    description: "Your files are processed securely and are used only for the selected tool operation.",
    icon: ShieldCheck,
  },
];

export function WhyChoosePdfRoot() {
  return (
    <section className="border-t border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Why Choose PDFRoot?"
          title="Built for everyday PDF and image work"
          description="Simple, fast, and mobile-friendly tools for documents, forms, photos, and uploads."
        />
        <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div key={feature.title} className="h-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-black text-slate-950">{feature.title}</h3>
                {feature.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
