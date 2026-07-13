import Image from "next/image";
import type { Tool } from "@/lib/tools";

export function ToolDirectoryIcon({ tool, size = "card" }: { tool: Tool; size?: "card" | "search" | "mobile" | "menu" }) {
  const isTrimmedExactKbIcon = tool.slug === "resize-image-to-exact-kb";
  const uncroppedCardIconSizes: Record<string, string> = {
    "rrb-photo-resize": "h-[44px] w-[44px] sm:h-[50px] sm:w-[50px]",
    "upsc-photo-resize": "h-[50px] w-[50px] sm:h-14 sm:w-14",
    "front-back-card-merge": "h-[42px] w-[42px] sm:h-[47px] sm:w-[47px]",
    "signature-resize-tool": "h-[50px] w-[50px] sm:h-14 sm:w-14",
  };
  const uncroppedCardIconSize = uncroppedCardIconSizes[tool.slug];

  if (size === "mobile" || size === "menu") {
    const preserveFullIcon = Boolean(uncroppedCardIconSize || isTrimmedExactKbIcon);
    return (
      <span data-original-tool-icon="true" aria-hidden="true" className="relative block h-[18px] w-[18px] shrink-0 overflow-hidden rounded-sm">
        <Image
          src={`/icons/tools/${tool.slug}.png`}
          alt=""
          width={36}
          height={36}
          className={preserveFullIcon ? "h-[18px] w-[18px] object-contain" : "absolute inset-0 h-[18px] w-[18px] max-w-none scale-[1.65] object-cover"}
        />
      </span>
    );
  }

  if (size === "search") {
    return (
      <span aria-hidden="true" className={`relative block h-11 w-11 shrink-0 rounded-md ${uncroppedCardIconSize || isTrimmedExactKbIcon ? "overflow-visible" : "overflow-hidden"}`}>
        <Image
          src={`/icons/tools/${tool.slug}.png`}
          alt=""
          width={44}
          height={44}
          className={uncroppedCardIconSize || isTrimmedExactKbIcon ? "h-11 w-11 object-contain" : "h-11 w-11 object-cover"}
        />
      </span>
    );
  }

  if (isTrimmedExactKbIcon) {
    return (
      <span aria-hidden="true" className="block h-8 w-8 shrink-0 sm:h-9 sm:w-9">
        <Image
          src={`/icons/tools/${tool.slug}.png`}
          alt=""
          width={72}
          height={72}
          className="h-8 w-8 object-contain sm:h-9 sm:w-9"
        />
      </span>
    );
  }

  if (uncroppedCardIconSize) {
    return (
      <span aria-hidden="true" className="relative block h-9 w-8 shrink-0 overflow-visible rounded-md sm:h-10 sm:w-9">
        <Image
          src={`/icons/tools/${tool.slug}.png`}
          alt=""
          width={72}
          height={72}
          className={`absolute left-1/2 top-0 max-w-none -translate-x-1/2 object-contain ${uncroppedCardIconSize}`}
        />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-md sm:h-9 sm:w-9">
      <Image
        src={`/icons/tools/${tool.slug}.png`}
        alt=""
        width={72}
        height={72}
        className="absolute inset-0 h-full w-full max-w-none scale-[1.65] object-cover"
      />
    </span>
  );
}
