import Image from "next/image";

export function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-transparent">
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
          <Image src="/pdfroot-icon-logo.png" alt="PDFRoot logo icon" fill sizes="36px" className="object-contain" priority />
        </span>
        <span className="whitespace-nowrap text-[1.35rem] font-black leading-none tracking-tight" aria-label="PDFRoot">
          <span className="text-[#FF2D2D]">PDF</span>
          <span className="text-slate-950">Root</span>
        </span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 bg-transparent sm:gap-2">
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg sm:h-12 sm:w-12 lg:h-14 lg:w-14">
        <Image
          src="/pdfroot-icon-logo.png"
          alt="PDFRoot logo icon"
          fill
          sizes="(min-width: 1024px) 56px, (min-width: 640px) 48px, 40px"
          className="object-contain"
          priority
        />
      </span>
      <span className="whitespace-nowrap text-[1.5rem] font-black leading-none tracking-tight sm:text-[1.8rem] lg:text-[2.05rem]" aria-label="PDFRoot">
        <span className="text-[#FF2D2D]">PDF</span>
        <span className="text-slate-950">Root</span>
      </span>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF2D2D]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">{title}</h2>
      <p className="mt-4 text-lg leading-8 text-slate-600">{description}</p>
    </div>
  );
}
