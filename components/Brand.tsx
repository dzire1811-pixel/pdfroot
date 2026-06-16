import Image from "next/image";
import type { ReactNode } from "react";

export function BrandText() {
  return (
    <span className="whitespace-nowrap" aria-label="PDFRoot">
      <span className="text-[#FF2D2D]">PDF</span>
      <span className="text-slate-950">Root</span>
    </span>
  );
}

export function BrandPhrase({ text }: { text: string }) {
  const parts = text.split("PDFRoot");

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? <BrandText /> : null}
        </span>
      ))}
    </>
  );
}

function formatBrandText(content: ReactNode) {
  return typeof content === "string" ? <BrandPhrase text={content} /> : content;
}

export function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="inline-flex shrink-0 items-center bg-transparent">
        <Image src="/pdfroot-brand-logo.svg" alt="PDFRoot logo" width={570} height={146} sizes="140px" className="h-9 w-auto max-w-[140px] shrink-0 object-contain" priority />
      </div>
    );
  }

  return (
    <div className="inline-flex shrink-0 items-center bg-transparent">
      <Image
        src="/pdfroot-brand-logo.svg"
        alt="PDFRoot logo"
        width={570}
        height={146}
        sizes="(min-width: 1024px) 220px, (min-width: 640px) 188px, 156px"
        className="h-10 w-auto max-w-[156px] shrink-0 object-contain sm:h-12 sm:max-w-[188px] lg:h-14 lg:max-w-[220px]"
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
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#FF2D2D]">{formatBrandText(eyebrow)}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">{formatBrandText(title)}</h2>
      <p className="mt-4 text-lg leading-8 text-slate-600">{formatBrandText(description)}</p>
    </div>
  );
}
