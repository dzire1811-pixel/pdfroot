import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import type { Tool } from "@/lib/tools";

const desktopToolOrder: Record<string, string> = {
  "merge-pdf": "lg:order-1",
  "split-pdf": "lg:order-2",
  "pdf-to-jpg": "lg:order-3",
  "jpg-to-pdf": "lg:order-4",
  "compress-image": "lg:order-5",
  "background-remover": "lg:order-6",
  "compress-pdf": "lg:order-7",
  "resize-image-to-exact-kb": "lg:order-8",
};

export function PopularTools({ tools }: { tools: Tool[] }) {
  return (
    <section id="tools" className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div>
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Popular Tools</p>
            <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              The tools people open every single day
            </h2>
          </div>
        </div>

        <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,14fr)_minmax(0,11fr)]">
          <div className="min-w-0 lg:self-center">
            <div className="mb-3 grid h-5 min-w-0 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              <Link href="/tools" className="inline-flex h-5 items-center gap-1.5 justify-self-end text-sm font-medium leading-5 text-foreground hover:text-primary md:col-start-2 lg:col-start-3">
                View all tools
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              {tools.map((tool) => (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  style={getToolRowTintStyle(tool.slug)}
                  className={`group flex h-[40px] min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-[background-color,border-color,box-shadow] hover:border-primary/40 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)] ${desktopToolOrder[tool.slug] ?? ""}`}
                >
                  <span className="h-4 w-4 shrink-0 [&>span]:!h-4 [&>span]:!w-4">
                    <ToolDirectoryIcon tool={tool} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-normal leading-5 text-foreground">{tool.name}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-center bg-white p-4 sm:p-6 lg:h-[308px] lg:p-0">
            <PopularToolsWorkflowIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}

function PopularToolsWorkflowIllustration() {
  return (
    <div className="flex aspect-[44/29] w-[92%] items-center justify-center lg:aspect-auto lg:h-[98%] lg:w-full">
      <svg
        viewBox="-46 7 532 268"
        preserveAspectRatio="xMidYMid meet"
        className="hidden h-full w-full object-contain lg:block"
        role="img"
        aria-label="Merge, compress, and convert a PDF document"
      >
        <g transform="translate(220 141) scale(1.021) translate(-220 -141)">
          <PopularToolsDesktopArtwork />
        </g>
      </svg>
      <svg
        viewBox="14 8 412 266"
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full object-contain lg:hidden"
        role="img"
        aria-labelledby="popular-tools-workflow-title"
      >
        <title id="popular-tools-workflow-title">Merge, compress, and convert a PDF document</title>

        <path d="M108 28 206 10l17 91-98 18Z" fill="#EFF6FF" />
        <path d="m313 181 86-17 18 91-87 17Z" fill="#F0FDF4" />

        <path d="M127 20h156l30 30v220H127Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M283 20v30h30" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M151 61h102M151 77h126M151 93h108M151 184h128M151 201h111M151 218h132M151 235h96" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
        <rect x="172" y="116" width="96" height="44" rx="10" fill="#EF4444" />
        <text x="220" y="145" textAnchor="middle" fill="#FFFFFF" fontSize="23" fontWeight="700" fontFamily="Inter, sans-serif">PDF</text>

        <g>
          <rect x="20" y="42" width="92" height="96" rx="20" fill="#FEF2F2" />
          <path d="M43 70h43l13 13v42H43Z" fill="#FFFFFF" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M86 70v13h13" fill="#FEE2E2" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M32 57h43l13 13v42H32Z" fill="#FFFFFF" stroke="#F87171" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M75 57v13h13" fill="#FEE2E2" stroke="#F87171" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M53 91h24m-12-8 12 8-12 8" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <g>
          <rect x="22" y="165" width="90" height="92" rx="20" fill="#F0FDF4" />
          <path d="M41 190h18m-8-8 8 8-8 8M93 190H75m8-8-8 8 8 8M41 232h18m-8 8 8-8-8-8M93 232H75m8 8-8-8 8-8" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="58" y="202" width="18" height="18" rx="4" fill="#FFFFFF" stroke="#16A34A" strokeWidth="2.5" />
        </g>

        <g>
          <rect x="326" y="52" width="94" height="190" rx="22" fill="#EFF6FF" />
          <path d="M342 72h34l11 11v42h-45Z" fill="#FFFFFF" stroke="#F87171" strokeWidth="2" strokeLinejoin="round" />
          <path d="M376 72v11h11" fill="#FEE2E2" stroke="#F87171" strokeWidth="2" strokeLinejoin="round" />
          <rect x="347" y="94" width="35" height="18" rx="5" fill="#EF4444" />
          <text x="364.5" y="107" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">PDF</text>

          <path d="M366 139v16m0 0-8-8m8 8 8-8" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M366 155h-19m19 0h20" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />

          <path d="M335 168h34l10 10v40h-44Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="2" strokeLinejoin="round" />
          <path d="M369 168v10h10" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2" strokeLinejoin="round" />
          <rect x="340" y="190" width="34" height="17" rx="5" fill="#2F80ED" />
          <text x="357" y="202" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">DOC</text>

          <path d="M377 168h31l9 9v41h-40Z" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="2" strokeLinejoin="round" />
          <path d="M408 168v9h9" fill="#FFEDD5" stroke="#FDBA74" strokeWidth="2" strokeLinejoin="round" />
          <rect x="381" y="190" width="32" height="17" rx="5" fill="#FF7A00" />
          <text x="397" y="202" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">JPG</text>
        </g>
      </svg>
    </div>
  );
}

function PopularToolsDesktopArtwork() {
  return (
    <>
      <path d="M108 28 206 10l17 91-98 18Z" fill="#EFF6FF" transform="translate(-40 0)" />
      <path d="m313 181 86-17 18 91-87 17Z" fill="#F0FDF4" transform="translate(40 0)" />

      <path d="M127 20h156l30 30v220H127Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M283 20v30h30" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M151 61h102M151 77h126M151 93h108M151 184h128M151 201h111M151 218h132M151 235h96" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
      <rect x="172" y="116" width="96" height="44" rx="10" fill="#EF4444" />
      <text x="220" y="145" textAnchor="middle" fill="#FFFFFF" fontSize="23" fontWeight="700" fontFamily="Inter, sans-serif">PDF</text>

      <g transform="translate(-60 0)">
        <rect x="20" y="42" width="92" height="96" rx="20" fill="#FEF2F2" />
        <path d="M43 70h43l13 13v42H43Z" fill="#FFFFFF" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M86 70v13h13" fill="#FEE2E2" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M32 57h43l13 13v42H32Z" fill="#FFFFFF" stroke="#F87171" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M75 57v13h13" fill="#FEE2E2" stroke="#F87171" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M53 91h24m-12-8 12 8-12 8" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g transform="translate(-60 0)">
        <rect x="22" y="165" width="90" height="92" rx="20" fill="#F0FDF4" />
        <path d="M41 190h18m-8-8 8 8-8 8M93 190H75m8-8-8 8 8 8M41 232h18m-8 8 8-8-8-8M93 232H75m8 8-8-8 8-8" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="58" y="202" width="18" height="18" rx="4" fill="#FFFFFF" stroke="#16A34A" strokeWidth="2.5" />
      </g>

      <g transform="translate(60 0)">
        <rect x="326" y="52" width="94" height="190" rx="22" fill="#EFF6FF" />
        <path d="M342 72h34l11 11v42h-45Z" fill="#FFFFFF" stroke="#F87171" strokeWidth="2" strokeLinejoin="round" />
        <path d="M376 72v11h11" fill="#FEE2E2" stroke="#F87171" strokeWidth="2" strokeLinejoin="round" />
        <rect x="347" y="94" width="35" height="18" rx="5" fill="#EF4444" />
        <text x="364.5" y="107" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">PDF</text>

        <path d="M366 139v16m0 0-8-8m8 8 8-8" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M366 155h-19m19 0h20" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />

        <path d="M335 168h34l10 10v40h-44Z" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="2" strokeLinejoin="round" />
        <path d="M369 168v10h10" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2" strokeLinejoin="round" />
        <rect x="340" y="190" width="34" height="17" rx="5" fill="#2F80ED" />
        <text x="357" y="202" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">DOC</text>

        <path d="M377 168h31l9 9v41h-40Z" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="2" strokeLinejoin="round" />
        <path d="M408 168v9h9" fill="#FFEDD5" stroke="#FDBA74" strokeWidth="2" strokeLinejoin="round" />
        <rect x="381" y="190" width="32" height="17" rx="5" fill="#FF7A00" />
        <text x="397" y="202" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700" fontFamily="Inter, sans-serif">JPG</text>
      </g>
    </>
  );
}
