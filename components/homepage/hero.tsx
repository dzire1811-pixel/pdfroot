import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="pdfroot-hero relative overflow-visible border-b border-border bg-white" aria-labelledby="homepage-hero-title">
      <div className="pdfroot-hero-glow pdfroot-hero-glow-left" aria-hidden="true" />
      <div className="pdfroot-hero-glow pdfroot-hero-glow-right" aria-hidden="true" />

      <div className="pdfroot-hero-grid relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1800px] grid-cols-1 items-center gap-10 overflow-visible px-6 py-16 md:gap-12 md:py-20 lg:grid-cols-[minmax(0,0.84fr)_minmax(520px,1.16fr)] lg:gap-8 lg:px-8 lg:py-14 xl:gap-16 xl:py-16">
        <div className="z-10 mx-auto max-w-[680px] text-center lg:mx-0 lg:translate-y-4 lg:text-left">
          <h1 id="homepage-hero-title" className="hero-title max-w-[12ch] text-foreground max-lg:mx-auto">
            Every PDF task, made <span className="text-primary">simple.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-[550px] text-lg leading-relaxed text-muted-foreground sm:text-xl lg:mx-0">
            Convert, edit and prepare PDFs and images in just a few clicks.
          </p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <Link
              href="/tools"
              className="focus-ring group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(220,38,38,0.2)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-[0_18px_36px_rgba(220,38,38,0.25)]"
            >
              Explore All Tools
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="#tools"
              className="focus-ring inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-white px-6 py-3.5 text-base font-semibold text-foreground shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-[transform,border-color,box-shadow,color] hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
            >
              Popular Tools
            </Link>
          </div>

          <p className="mt-3.5 text-center text-xs leading-relaxed text-zinc-600 sm:hidden">
            <span className="block whitespace-nowrap">
              Files Processed Locally <span className="text-zinc-400">|</span> Fast &amp; Free
            </span>
            <span className="block whitespace-nowrap">Works on Mobile &amp; Desktop</span>
          </p>

          <p className="mt-4 hidden max-w-[550px] text-left text-sm leading-relaxed text-zinc-600 sm:block">
            Files Processed Locally <span className="text-zinc-400">|</span> Fast &amp; Free <span className="text-zinc-400">|</span> Works on Mobile &amp; Desktop
          </p>
        </div>

        <div className="pdfroot-hero-artwork relative mx-auto flex w-full max-w-[760px] items-center justify-center overflow-visible lg:translate-x-6" aria-hidden="true">
          <PdfRootHeroArtwork />
        </div>
      </div>
    </section>
  );
}

function PdfRootHeroArtwork() {
  return (
    <svg
      viewBox="-12 0 760 610"
      className="block h-auto w-full max-w-full overflow-visible"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hero-soft-red" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFF7F7" />
          <stop offset="1" stopColor="#FFE8E8" />
        </linearGradient>
        <linearGradient id="hero-page" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FAFAFA" />
        </linearGradient>
        <filter id="hero-shadow" x="-25%" y="-25%" width="150%" height="170%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#0F172A" floodOpacity="0.11" />
        </filter>
        <filter id="hero-card-shadow" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#0F172A" floodOpacity="0.088" />
        </filter>
      </defs>

      <path d="M134 91C220 27 372 24 502 70c141 50 214 173 181 290-36 126-178 212-327 194-145-17-283-102-307-226-18-92 12-176 85-237Z" fill="url(#hero-soft-red)" />
      <circle cx="637" cy="121" r="54" fill="#FFFFFF" fillOpacity="0.72" />
      <circle cx="105" cy="463" r="37" fill="#F8FAFC" />
      <path d="M95 142h42M116 121v42" stroke="#E4E4E7" strokeWidth="3" strokeLinecap="round" />
      <path d="m668 445 13 13 13-13M681 458v-31" fill="none" stroke="#FCA5A5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      <g className="pdfroot-float-slow" filter="url(#hero-shadow)">
        <g transform="rotate(-8 312 294)">
          <path d="M174 106h264l56 56v322H174Z" fill="#F4F4F5" stroke="#E4E4E7" strokeWidth="2" strokeLinejoin="round" />
          <path d="M438 106v56h56" fill="#E4E4E7" stroke="#D4D4D8" strokeWidth="2" strokeLinejoin="round" />
          <rect x="215" y="188" width="201" height="12" rx="6" fill="#E4E4E7" />
          <rect x="215" y="216" width="157" height="9" rx="4.5" fill="#E4E4E7" />
          <rect x="215" y="243" width="184" height="9" rx="4.5" fill="#E4E4E7" />
        </g>
      </g>

      <g className="pdfroot-float" filter="url(#hero-shadow)" opacity="1" transform="translate(0 0)">
        <path d="M277 83h264l56 56v322H277Z" fill="url(#hero-page)" stroke="#D4D4D8" strokeWidth="2" strokeLinejoin="round" />
        <path d="M541 83v56h56" fill="#FEF2F2" stroke="#D4D4D8" strokeWidth="2" strokeLinejoin="round" />
        <rect x="317" y="124" width="81" height="34" rx="17" fill="#EF3030" />
        <text x="357.5" y="147" textAnchor="middle" fill="#FFFFFF" fontSize="16" fontWeight="800" fontFamily="Inter, ui-sans-serif, sans-serif" opacity="1">PDF</text>
        <rect x="317" y="187" width="211" height="11" rx="5.5" fill="#D4D4D8" />
        <rect x="317" y="214" width="171" height="9" rx="4.5" fill="#E4E4E7" />
        <rect x="317" y="241" width="206" height="9" rx="4.5" fill="#E4E4E7" />
        <rect x="317" y="268" width="150" height="9" rx="4.5" fill="#E4E4E7" />
        <rect x="317" y="316" width="240" height="92" rx="13" fill="#FAFAFA" stroke="#E4E4E7" />
        <path d="m337 381 38-35 32 25 45-41 81 61H337Z" fill="#FECACA" />
        <circle cx="500" cy="342" r="12" fill="#EF3030" fillOpacity="0.78" />
        <path d="M317 433h94M427 433h53" stroke="#E4E4E7" strokeWidth="9" strokeLinecap="round" />
      </g>

      <g className="pdfroot-float-reverse" filter="url(#hero-card-shadow)">
        <rect x="62" y="220" width="128" height="116" rx="22" fill="#FFFFFF" stroke="#E4E4E7" />
        <path d="M91 249h45l18 18v39H91Z" fill="#FFF1F2" stroke="#EF3030" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M136 249v18h18" fill="#FECACA" stroke="#EF3030" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M105 289h52m-9-9 9 9-9 9" fill="none" stroke="#EF3030" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <text x="126" y="321" textAnchor="middle" fill="#52525B" fontSize="12" fontWeight="700" fontFamily="Inter, ui-sans-serif, sans-serif">MERGE</text>
      </g>

      <g className="pdfroot-float" filter="url(#hero-card-shadow)">
        <rect x="574" y="187" width="126" height="112" rx="22" fill="#FFFFFF" stroke="#E4E4E7" />
        <path d="M605 222h18m-9-9 9 9-9 9M669 222h-18m9-9-9 9 9 9M605 264h18m-9 9 9-9-9-9M669 264h-18m9 9-9-9 9-9" fill="none" stroke="#EF3030" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="628" y="234" width="18" height="18" rx="4" fill="#FEE2E2" stroke="#EF3030" strokeWidth="2" />
        <text x="637" y="286" textAnchor="middle" fill="#52525B" fontSize="12" fontWeight="700" fontFamily="Inter, ui-sans-serif, sans-serif">COMPRESS</text>
      </g>

      <g className="pdfroot-float-reverse" filter="url(#hero-card-shadow)">
        <rect x="548" y="424" width="143" height="116" rx="22" fill="#FFFFFF" stroke="#E4E4E7" />
        <path d="M579 454h28l10 10v36h-38Z" fill="#FEF2F2" stroke="#EF3030" strokeWidth="2" strokeLinejoin="round" />
        <path d="M607 454v10h10" fill="#FECACA" stroke="#EF3030" strokeWidth="2" />
        <path d="M659 477h-28m8-8-8 8 8 8" fill="none" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="619" y="523" textAnchor="middle" fill="#52525B" fontSize="12" fontWeight="700" fontFamily="Inter, ui-sans-serif, sans-serif">CONVERT</text>
      </g>

      <g className="pdfroot-float-slow" filter="url(#hero-card-shadow)">
        <rect x="105" y="384" width="140" height="118" rx="22" fill="#FFFFFF" stroke="#E4E4E7" />
        <path d="M137 420h47v40h-47Z" fill="#FEF2F2" stroke="#EF3030" strokeWidth="2.5" />
        <path d="m140 454 13-12 10 8 10-10 8 7" fill="none" stroke="#EF3030" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M129 430v-14h14M192 430v-14h-14M129 450v17h14M192 450v17h-14" fill="none" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <text x="175" y="486" textAnchor="middle" fill="#52525B" fontSize="12" fontWeight="700" fontFamily="Inter, ui-sans-serif, sans-serif">CROP</text>
      </g>

      <g className="pdfroot-float-reverse" filter="url(#hero-card-shadow)">
        <rect x="207" y="493" width="112" height="91" rx="20" fill="#FFFFFF" stroke="#E4E4E7" />
        <rect x="239" y="528" width="48" height="34" rx="8" fill="#FEF2F2" stroke="#EF3030" strokeWidth="2.5" />
        <path d="M250 528v-9a13 13 0 0 1 26 0v9M263 540v10" fill="none" stroke="#EF3030" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="263" cy="540" r="3" fill="#EF3030" />
      </g>

      <g className="pdfroot-float" filter="url(#hero-card-shadow)">
        <rect x="452" y="32" width="105" height="84" rx="20" fill="#FFFFFF" stroke="#E4E4E7" />
        <circle cx="504.5" cy="68" r="23" fill="#FEF2F2" />
        <text x="504.5" y="76" textAnchor="middle" fill="#EF3030" fontSize="22" fontWeight="800" fontFamily="Inter, ui-sans-serif, sans-serif">Aa</text>
        <text x="504.5" y="103" textAnchor="middle" fill="#52525B" fontSize="11" fontWeight="700" fontFamily="Inter, ui-sans-serif, sans-serif">OCR</text>
      </g>

      <g className="pdfroot-float-slow" filter="url(#hero-card-shadow)">
        <rect x="633" y="330" width="84" height="78" rx="19" fill="#FFFFFF" stroke="#E4E4E7" />
        <path d="M655 351h32l10 10v27h-42Z" fill="#FEF2F2" stroke="#EF3030" strokeWidth="2" strokeLinejoin="round" />
        <path d="M687 351v10h10" fill="#FECACA" stroke="#EF3030" strokeWidth="2" />
        <path d="m662 380 9-9 7 6 5-5 8 8" fill="none" stroke="#EF3030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <circle className="pdfroot-pulse-dot" cx="73" cy="184" r="7" fill="#EF3030" />
      <circle className="pdfroot-pulse-dot" cx="720" cy="149" r="5" fill="#A1A1AA" />
      <path d="m70 370 8 8 8-8-8-8Z" fill="#FCA5A5" />
      <path d="m611 91 8 8 8-8-8-8Z" fill="#D4D4D8" />
    </svg>
  );
}
