import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import type { Tool } from "@/lib/tools";

const exams = ["SSC", "RRB", "UPSC", "GPSC", "IBPS", "OJAS", "Railway"];

export function GovFormTools({ tools }: { tools: Tool[] }) {
  return (
    <section id="gov-tools" className="border-b border-border bg-muted/40">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-[50px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Built for India&apos;s exams</p>
          <h2 className="gov-form-heading mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Never get your application rejected because of incorrect photo or signature size
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Built for SSC, RRB, UPSC, GPSC, IBPS, OJAS and Railway recruitment forms.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-[5px]">
            {exams.map((exam) => (
              <span key={exam} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                {exam}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid items-stretch gap-6 lg:mt-8 lg:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] lg:gap-11">
          <ApplicationFileValidator />

          <div className="grid gap-3 sm:grid-cols-2 lg:self-center lg:gap-[14px]">
            {tools.slice(0, 6).map((tool) => {
              return (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  style={getToolRowTintStyle(tool.slug)}
                  className="group flex h-[47px] min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-[background-color,border-color,box-shadow] hover:border-primary/40 hover:bg-[var(--tool-row-tint)] hover:shadow-sm focus-visible:bg-[var(--tool-row-tint)] active:bg-[var(--tool-row-tint)]"
                >
                  <span className="h-[18px] w-[18px] shrink-0 [&>span]:!h-[18px] [&>span]:!w-[18px]">
                    <ToolDirectoryIcon tool={tool} />
                  </span>
                  <h3 className="min-w-0 flex-1 truncate text-sm font-normal leading-5 text-foreground">{tool.name}</h3>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ApplicationFileValidator() {
  return (
    <div className="flex min-w-0 items-center justify-center lg:-translate-y-[6px] lg:self-center lg:p-3">
      <GovernmentFormValidatorIllustration />
    </div>
  );
}

function GovernmentFormValidatorIllustration() {
  return (
    <svg viewBox="0 0 720 260" className="block h-full w-full scale-[1.06] object-contain" role="img" aria-label="Government application document with validated passport photo and signature">
      <rect x="174" y="22" width="150" height="112" rx="18" fill="#EFF6FF" transform="rotate(-8 249 78)" />
      <rect x="520" y="132" width="142" height="102" rx="20" fill="#ECFDF5" transform="rotate(-7 591 183)" />
      <circle cx="656" cy="46" r="25" fill="#FEF2F2" />
      <circle cx="662" cy="42" r="4" fill="#EF4444" />
      <circle cx="676" cy="42" r="4" fill="#60A5FA" />
      <circle cx="669" cy="55" r="4" fill="#A78BFA" />
      <path d="M220 13h284l58 58v174H220Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M504 13v58h58" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="253" y="39" width="43" height="43" rx="11" fill="#FEF2F2" />
      <path d="M266 50h13l6 6v16h-19Z" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M270 59h11m-11 5h8" stroke="#EF4444" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M316 47h142M316 62h172M316 77h126" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />

      <text x="253" y="108" fill="#64748B" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">FILE REQUIREMENTS</text>
      <rect x="253" y="117" width="60" height="25" rx="12.5" fill="#FEF2F2" />
      <text x="269" y="133" fill="#DC2626" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">20 KB</text>
      <rect x="321" y="117" width="102" height="25" rx="12.5" fill="#EFF6FF" />
      <text x="336" y="133" fill="#2563EB" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">200 × 230 px</text>
      <rect x="431" y="117" width="52" height="25" rx="12.5" fill="#F5F3FF" />
      <text x="446" y="133" fill="#7C3AED" fontSize="10" fontWeight="600" fontFamily="Inter, sans-serif">JPG</text>

      <rect x="253" y="158" width="12" height="12" rx="3" fill="#F0FDF4" stroke="#22C55E" strokeWidth="1.3" />
      <path d="m256 164 3 3 5-7" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M277 164h145" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
      <rect x="253" y="183" width="12" height="12" rx="3" fill="#F0FDF4" stroke="#22C55E" strokeWidth="1.3" />
      <path d="m256 189 3 3 5-7" fill="none" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M277 189h180" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
      <path d="M253 216h116M253 230h86" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />

      <g>
        <rect x="31" y="39" width="173" height="108" rx="16" fill="#FFFFFF" stroke="#BFDBFE" strokeWidth="1.6" />
        <rect x="47" y="55" width="76" height="76" rx="11" fill="#EFF6FF" />
        <circle cx="85" cy="79" r="14" fill="#93C5FD" />
        <path d="M57 124c2-20 13-30 28-30s26 10 28 30" fill="#60A5FA" />
        <text x="47" y="141" fill="#2563EB" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">PASSPORT PHOTO</text>
        <path d="M138 82h43M138 95h35M138 108h45" stroke="#DBEAFE" strokeWidth="4" strokeLinecap="round" />
        <circle cx="184" cy="59" r="12" fill="#16A34A" />
        <path d="m179 59 3 3 6-7" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g>
        <rect x="48" y="166" width="194" height="62" rx="15" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="1.6" />
        <rect x="62" y="179" width="42" height="34" rx="9" fill="#F5F3FF" />
        <path d="M70 204c8-15 12 8 22-6 5-7 8 8 14-4" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="116" y="184" fill="#7C3AED" fontSize="9" fontWeight="600" fontFamily="Inter, sans-serif">SIGNATURE</text>
        <path d="M116 204c13-16 18 9 31-5 8-9 13 10 24-3 8-9 14 7 28-5" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="222" cy="186" r="12" fill="#16A34A" />
        <path d="m217 186 3 3 6-7" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g transform="translate(567 221) rotate(-3) scale(.975) translate(-567 -221)">
        <rect x="482" y="203" width="170" height="36" rx="10" fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.6" />
        <circle cx="502" cy="221" r="9" fill="#16A34A" />
        <path d="m498 221 3 3 5-7" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <text x="517" y="226" fill="#15803D" fontSize="14" fontWeight="700" fontFamily="Inter, sans-serif">Ready to Submit</text>
      </g>
    </svg>
  );
}
