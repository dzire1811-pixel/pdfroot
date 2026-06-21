import { FileCheck2, Lock, Smartphone, UserCheck } from "lucide-react";

const points = [
  { icon: UserCheck, title: "No Registration", desc: "Start using any tool instantly" },
  { icon: Lock, title: "Secure Processing", desc: "Encrypted SSL on every upload" },
  { icon: FileCheck2, title: "Government-Form Ready", desc: "Exact KB sizing built in" },
  { icon: Smartphone, title: "Works on Mobile", desc: "Built mobile-first for any device" },
];

export function Stats() {
  return (
    <section className="border-b border-border bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((point) => (
            <div key={point.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/10 text-background">
                <point.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-base font-semibold">{point.title}</div>
                <div className="mt-0.5 text-sm text-background/60">{point.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
