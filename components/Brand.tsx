import Image from "next/image";

export function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex items-center bg-transparent">
        <Image src="/pdfroot-brand-logo.svg" alt="PDFRoot logo" width={470} height={146} sizes="116px" className="h-9 w-auto object-contain" priority />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center bg-transparent">
      <Image
        src="/pdfroot-brand-logo.svg"
        alt="PDFRoot logo"
        width={470}
        height={146}
        sizes="(min-width: 1024px) 180px, (min-width: 640px) 155px, 130px"
        className="h-10 w-auto object-contain sm:h-12 lg:h-14"
        priority
      />
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
