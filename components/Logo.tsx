import Image from "next/image";

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={joinClasses("inline-flex items-center gap-2.5 sm:gap-3", className)}>
      <Image
        src="/pdfroot-pr-monogram.svg"
        alt="PDFRoot"
        width={512}
        height={512}
        priority
        sizes="(max-width: 640px) 38px, 48px"
        className="h-9 w-auto shrink-0 object-contain sm:h-11"
      />
      <span className="whitespace-nowrap text-xl font-bold leading-none tracking-tight sm:text-2xl" aria-label="PDFRoot">
        <span className="text-[#EF4444]">PDF</span>
        <span className="text-[#111111]">Root</span>
      </span>
    </span>
  );
}
