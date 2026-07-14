import Image from "next/image";
import type { Tool } from "@/lib/tools";

export function ToolDirectoryIcon({ tool }: { tool: Tool }) {
  return (
    <span data-original-tool-icon="true" aria-hidden="true" className="relative block h-5 w-5 shrink-0">
      <Image
        src={`/icons/tools/${tool.slug}.svg`}
        alt=""
        width={20}
        height={20}
        className="block h-full w-full shrink-0 object-contain [shape-rendering:geometricPrecision]"
      />
    </span>
  );
}
