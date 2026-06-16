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
        <Image
          src="/pdfroot-brand-logo.svg"
          alt="PDFRoot logo"
          width={570}
          height={146}
          sizes="156px"
          className="h-10 w-auto max-w-[156px] shrink-0 transform-none object-contain opacity-100 blur-none filter-none"
          priority
        />
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
        sizes="(min-width: 1024px) 172px, 156px"
        className="h-10 w-auto max-w-[156px] shrink-0 transform-none object-contain opacity-100 blur-none filter-none lg:h-11 lg:max-w-[172px]"
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
