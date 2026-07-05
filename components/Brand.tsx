/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

const supportEmail = process.env.NEXT_PUBLIC_PDFROOT_CONTACT_EMAIL?.trim() || "contact@example.com";

export const siteConfig = {
  name: "PDFRoot",
  domain: "pdfroot.com",
  url: "https://pdfroot.com",
  supportEmail,
  supportMailto: `mailto:${supportEmail}`,
} as const;

export function BrandText({ styled = false }: { styled?: boolean }) {
  if (!styled) return <>PDFRoot</>;

  return (
    <span className="whitespace-nowrap text-current normal-case" aria-label="PDFRoot">
      <span className="text-[#EF4444]">PDF</span>
      <span className="text-[#111111]">Root</span>
    </span>
  );
}

export function BrandPhrase({ text, styled = false }: { text: string; styled?: boolean }) {
  if (!styled) return <>{text}</>;

  const parts = text.split("PDFRoot");
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? <BrandText styled /> : null}
        </span>
      ))}
    </>
  );
}

function formatBrandText(content: ReactNode, styled = false) {
  return typeof content === "string" ? <BrandPhrase text={content} styled={styled} /> : content;
}

export function LogoMark() {
  return <Logo />;
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
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{formatBrandText(eyebrow, true)}</p>
      <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{formatBrandText(title, true)}</h2>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{formatBrandText(description, true)}</p>
    </div>
  );
}
