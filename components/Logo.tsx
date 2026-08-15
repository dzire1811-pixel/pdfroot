import Image from "next/image";

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={joinClasses("inline-flex items-center gap-2.5 sm:gap-3", className)}>
      <Image
        data-pdfroot-logo-image="true"
        src="/branding/logo.svg"
        alt="PDFRoot"
        width={512}
        height={512}
        sizes="(max-width: 640px) 38px, 48px"
        className="h-9 w-auto shrink-0 object-contain sm:h-11"
      />
      <span className="whitespace-nowrap text-xl font-bold leading-none tracking-tight sm:text-2xl" aria-label="PDFRoot">
        <span className="text-[#B91C1C]">PDF</span>
        <span data-pdfroot-logo-root="true" className="text-[#111111]">Root</span>
      </span>
    </span>
  );
}

export function HorizontalLogo({ className }: { className?: string }) {
  return (
    <span
      className={joinClasses(
        "relative block h-9 w-[124.39px] shrink-0 overflow-hidden sm:h-11 sm:w-[148.48px]",
        className,
      )}
    >
      <Image
        data-pdfroot-logo-image="true"
        src="/branding/horizontal-logo.svg"
        alt="PDFRoot"
        width={430}
        height={160}
        loading="eager"
        sizes="(max-width: 640px) 129px, 158px"
        className="absolute left-1/2 top-1/2 h-12 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 sm:h-[58.72px]"
      />
    </span>
  );
}
