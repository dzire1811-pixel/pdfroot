"use client";

import Link from "next/link";
import { useState } from "react";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { isToolVisibleInListings } from "@/lib/toolVisibility";
import { tools } from "@/lib/tools";

const tabDefinitions = [
  { id: "resize", slug: "resize-image-to-exact-kb" },
  { id: "passport", slug: "passport-photo-maker" },
  { id: "jpg", slug: "jpg-to-pdf" },
] as const;

const tabs = tabDefinitions
  .filter((tab) => isToolVisibleInListings(tab.slug))
  .map((tab) => ({
    ...tab,
    tool: tools.find((tool) => tool.slug === tab.slug)!,
  }));

type TabId = (typeof tabs)[number]["id"];

const previewLabels: Record<TabId, string> = {
  resize: "Resize Image",
  passport: "Passport Photo",
  jpg: "JPG to PDF",
};

export function ProductShowcase() {
  const [active, setActive] = useState<TabId>("resize");
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <section id="showcase" className="overflow-visible border-b border-border bg-background">
      <div className="mx-auto max-w-[1800px] px-6 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Product Preview</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Clean previews of the tools before you open them
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Illustrative screens that show the workflow without pretending to process uploaded files.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-x-[3px] gap-y-2">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={
                  "inline-flex items-center gap-2 rounded-full border py-2 text-sm font-normal transition-colors " +
                  (isActive ? "border-primary bg-primary px-4 text-primary-foreground" : "preview-tab-inactive border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                <ToolDirectoryIcon tool={tab.tool} />
                {tab.tool.name}
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-7 flex w-full flex-col items-center">
          <WorkflowIllustration active={active} />
          <div className="mt-8 flex justify-center md:mt-9">
            <Link prefetch={false} href={`/${activeTab.slug}`} className="inline-flex h-[46px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-normal text-primary-foreground transition hover:bg-primary/90">
              Open {activeTab.tool.name}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileWorkflowIllustration({ active, previewLabel }: { active: TabId; previewLabel: string }) {
  return (
    <svg
      width="360"
      height="520"
      viewBox="0 0 360 520"
      role="img"
      aria-label="Image resize preview showing a photo, file size, dimensions, format, quality, and ready download."
      focusable="false"
      className="block h-auto w-[92%] max-w-[360px] md:hidden"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mobile-workflow-photo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="1" stopColor="#ecfeff" />
        </linearGradient>
        <linearGradient id="mobile-workflow-quality" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e53935" />
          <stop offset="0.34" stopColor="#f97316" />
          <stop offset="0.66" stopColor="#0ea5a8" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="mobile-workflow-shadow" x="-15%" y="-12%" width="130%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#0f172a" floodOpacity="0.07" />
        </filter>
        <filter id="mobile-workflow-handle" x="-70%" y="-70%" width="240%" height="240%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1d4ed8" floodOpacity="0.2" />
        </filter>
      </defs>

      <circle cx="38" cy="64" r="42" fill="#e53935" opacity="0.04" />
      <circle cx="326" cy="432" r="54" fill="#0ea5a8" opacity="0.04" />
      <path d="M18 452c54-34 92-24 126 8" fill="none" stroke="#3b82f6" strokeWidth="12" strokeLinecap="round" opacity="0.035" />

      <g filter="url(#mobile-workflow-shadow)">
        <rect x="10" y="8" width="340" height="504" rx="30" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.5" />
      </g>

      <rect x="28" y="26" width="304" height="44" rx="14" fill="#f8fafc" />
      <rect x="42" y="38" width="20" height="20" rx="6" fill="#e53935" />
      <path d="M48 43h8v10h-8zM50 41h4l2 2h-6z" fill="#ffffff" />
      <text x="72" y="55" fill="#111827" fontFamily="Inter, Arial, sans-serif" fontSize="14" fontWeight="700">{previewLabel}</text>
      <text x="316" y="55" textAnchor="end" fontFamily="Inter, Arial, sans-serif" fontSize="12.5" fontWeight="700" letterSpacing="-0.3"><tspan fill="#B91C1C">PDF</tspan><tspan fill="#111111">Root</tspan></text>

      <rect x="28" y="84" width="304" height="220" rx="22" fill="url(#mobile-workflow-photo)" stroke="#edf0f4" />
      {active === "jpg" ? (
        <g>
          <rect x="108" y="104" width="144" height="178" rx="16" fill="#ffffff" stroke="#bfdbfe" strokeWidth="2" />
          <rect x="128" y="126" width="104" height="66" rx="10" fill="#eff6ff" />
          <circle cx="151" cy="147" r="9" fill="#60a5fa" />
          <path d="m134 182 28-27 20 18 15-13 29 22z" fill="#93c5fd" />
          <path d="M130 214h100M130 232h82" stroke="#cbd5e1" strokeWidth="7" strokeLinecap="round" />
          <rect x="130" y="250" width="58" height="22" rx="7" fill="#fee2e2" />
          <text x="159" y="266" textAnchor="middle" fill="#c62828" fontFamily="Inter, Arial, sans-serif" fontSize="12" fontWeight="700">JPG</text>
        </g>
      ) : (
        <g>
          <circle cx="180" cy="157" r="42" fill="#f1c9a5" />
          <path d="M139 151c4-41 23-64 42-64 25 0 44 26 41 68-13-16-27-23-42-23-14 0-27 6-41 19z" fill="#334155" />
          <path d="M101 294c8-77 38-115 79-115s72 38 80 115" fill="#3b82f6" />
          {active === "passport" && <rect x="126" y="100" width="108" height="184" rx="17" fill="none" stroke="#e53935" strokeWidth="2.5" strokeDasharray="8 7" />}
        </g>
      )}

      <rect x="28" y="322" width="80" height="36" rx="18" fill="#fee2e2" />
      <circle cx="46" cy="340" r="6" fill="#e53935" />
      <text x="59" y="345" fill="#991b1b" fontFamily="Inter, Arial, sans-serif" fontSize="13" fontWeight="700">20 KB</text>
      <rect x="116" y="322" width="144" height="36" rx="18" fill="#ecfeff" />
      <circle cx="134" cy="340" r="6" fill="#0ea5a8" />
      <text x="147" y="345" fill="#0f766e" fontFamily="Inter, Arial, sans-serif" fontSize="12.5" fontWeight="700">200 × 230</text>
      <rect x="268" y="322" width="64" height="36" rx="18" fill="#eff6ff" />
      <circle cx="284" cy="340" r="6" fill="#3b82f6" />
      <text x="297" y="345" fill="#1d4ed8" fontFamily="Inter, Arial, sans-serif" fontSize="13" fontWeight="700">JPG</text>

      <rect x="44" y="384" width="272" height="12" rx="6" fill="#e5e7eb" />
      <rect x="44" y="384" width="208" height="12" rx="6" fill="url(#mobile-workflow-quality)" />
      <circle cx="252" cy="390" r="13" fill="#ffffff" stroke="#3b82f6" strokeWidth="4" filter="url(#mobile-workflow-handle)" />

      <rect x="58" y="422" width="132" height="48" rx="18" fill="#ecfdf5" stroke="#bbf7d0" strokeWidth="1.5" />
      <circle cx="82" cy="446" r="13" fill="#22a35a" />
      <path d="m76 446 4 4 8-9" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="104" y="451" fill="#15803d" fontFamily="Inter, Arial, sans-serif" fontSize="14" fontWeight="700">Ready</text>
      <path d="M206 446h35m-11-11 11 11-11 11" fill="none" stroke="#e53935" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="258" y="414" width="58" height="64" rx="14" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2" />
      <path d="M272 431h22l8 8v25h-30z" fill="#ffffff" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M294 431v9h8" fill="none" stroke="#f97316" strokeWidth="2.5" />
      <path d="M287 447v10m-5-5 5 5 5-5" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorkflowIllustration({ active }: { active: TabId }) {
  const previewLabel = previewLabels[active];

  return (
    <>
    <MobileWorkflowIllustration active={active} previewLabel={previewLabel} />
    <svg
      width="900"
      height="560"
      viewBox="0 0 900 560"
      role="img"
      aria-label="Image resize preview showing file size, dimensions, format, quality, and ready output."
      focusable="false"
      className="hidden aspect-[45/28] h-auto w-full md:block md:max-w-[820px] lg:max-w-[980px]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="preview-photo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="1" stopColor="#ecfeff" />
        </linearGradient>
        <linearGradient id="preview-progress" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e53935" />
          <stop offset="0.32" stopColor="#f97316" />
          <stop offset="0.62" stopColor="#0ea5a8" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="preview-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="13" stdDeviation="22" floodColor="#0f172a" floodOpacity="0.065" />
        </filter>
        <filter id="preview-shadow-hover" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="15" stdDeviation="23" floodColor="#0f172a" floodOpacity="0.075" />
        </filter>
        <filter id="preview-frame-shadow" x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.035" />
        </filter>
        <filter id="preview-handle-shadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1d4ed8" floodOpacity="0.22" />
        </filter>
        <style>{`
          .product-flow-mobile { display: none; }
          .product-card-shell {
            transition: transform 200ms ease;
            transform-box: fill-box;
            transform-origin: center;
          }
          .product-card-shadow { transition: filter 200ms ease; }
          .product-ready-float {
            animation: product-ready-float 4.8s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
          .product-action-pulse {
            animation: product-action-pulse 3.6s ease-in-out infinite;
            transform-box: fill-box;
            transform-origin: center;
          }
          .product-slider-shimmer {
            animation: product-slider-shimmer 4.5s ease-in-out infinite;
          }
          @keyframes product-ready-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes product-action-pulse {
            0%, 100% { opacity: .88; transform: translateX(0); }
            50% { opacity: 1; transform: translateX(2px); }
          }
          @keyframes product-slider-shimmer {
            0%, 100% { opacity: .94; }
            50% { opacity: 1; }
          }
          @media (hover: hover) {
            svg:hover .product-card-shell { transform: translateY(-2px); }
            svg:hover .product-card-shadow { filter: url(#preview-shadow-hover); }
          }
          @media (prefers-reduced-motion: reduce) {
            .product-card-shell,
            .product-card-shadow,
            .product-ready-float,
            .product-action-pulse,
            .product-slider-shimmer { animation: none; transition: none; }
          }
          @media (max-width: 639px) {
            .product-flow-desktop { display: none; }
            .product-flow-mobile { display: block; }
          }
        `}</style>
      </defs>

      <g className="product-flow-desktop">
        <circle cx="85" cy="101" r="85" fill="#e53935" opacity="0.045" />
        <circle cx="790" cy="452" r="108" fill="#0ea5a8" opacity="0.045" />
        <path d="M28 448c65-50 118-32 160 12" fill="none" stroke="#3b82f6" strokeWidth="22" strokeLinecap="round" opacity="0.02" />
        <path d="M720 72c58-42 110-30 142 18" fill="none" stroke="#e53935" strokeWidth="20" strokeLinecap="round" opacity="0.04" />
        <ellipse cx="450" cy="510" rx="210" ry="38" fill="#22a35a" opacity="0.04" />
        <path d="M600 512c76 42 158 38 232-4" fill="none" stroke="#3b82f6" strokeWidth="14" strokeLinecap="round" opacity="0.02" />

        <g className="product-card-shell">
          <g className="product-card-shadow" filter="url(#preview-shadow)">
            <rect x="80" y="28" width="740" height="494" rx="44" fill="#ffffff" stroke="#e5e7eb" strokeWidth="2" />
          </g>

        <rect x="118" y="60" width="664" height="58" rx="20" fill="#f8fafc" />
        <rect x="140" y="78" width="22" height="22" rx="7" fill="#e53935" />
        <path d="M146 84h10v11h-10zM148 81h5l3 3h-8z" fill="#ffffff" />
        <text x="176" y="100" fill="#111827" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700">{previewLabel}</text>
        <text x="692" y="100" textAnchor="end" fontFamily="Inter, Arial, sans-serif" fontSize="17" fontWeight="700" letterSpacing="-0.425"><tspan fill="#B91C1C">PDF</tspan><tspan fill="#111111">Root</tspan></text>

        <g>
          <rect x="118" y="138" width="398" height="334" rx="30" fill="#f8fafc" stroke="#edf0f4" strokeWidth="1" filter="url(#preview-frame-shadow)" />
          <rect x="142" y="160" width="350" height="288" rx="24" fill="url(#preview-photo-bg)" />
          {active === "jpg" ? (
            <g>
              <rect x="222" y="188" width="188" height="220" rx="18" fill="#ffffff" stroke="#bfdbfe" strokeWidth="3" />
              <path d="M254 238h124M254 266h124M254 294h92" stroke="#cbd5e1" strokeWidth="10" strokeLinecap="round" />
              <rect x="254" y="340" width="70" height="30" rx="8" fill="#fee2e2" />
              <text x="289" y="361" textAnchor="middle" fill="#c62828" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700">JPG</text>
              <path d="M420 286h45m-15-15 15 15-15 15" fill="none" stroke="#e53935" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : (
            <g>
              <g transform="translate(317 304) scale(.92) translate(-317 -304)">
                <circle cx="317" cy="246" r="54" fill="#f1c9a5" />
                <path d="M265 238c4-50 28-78 53-78 31 0 55 32 51 83-16-20-34-29-53-29-18 0-34 7-51 24z" fill="#334155" />
                <path d="M211 438c9-91 51-135 106-135s98 45 107 135" fill="#3b82f6" />
              </g>
              {active === "passport" && <rect x="245" y="178" width="144" height="216" rx="22" fill="none" stroke="#e53935" strokeWidth="3" strokeDasharray="10 9" />}
            </g>
          )}
          <rect x="158" y="419" width="124" height="30" rx="15" fill="#ffffff" stroke="#dbeafe" strokeWidth="0.75" />
          <text x="220" y="439" textAnchor="middle" fill="#2563eb" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700">LIVE PREVIEW</text>
        </g>

        <g transform="translate(0 -9)">
          <text x="548" y="164" fill="#111827" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700">Output settings</text>
          <rect x="548" y="182" width="118" height="44" rx="22" fill="#fee2e2" />
          <circle cx="570" cy="204" r="8" fill="#e53935" />
          <text x="592" y="210" fill="#991b1b" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700">20 KB</text>
          <rect x="676" y="182" width="118" height="44" rx="22" fill="#ecfeff" />
          <circle cx="698" cy="204" r="8" fill="#0ea5a8" />
          <text x="718" y="210" fill="#0f766e" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700">200 × 230</text>
          <rect x="548" y="238" width="118" height="44" rx="22" fill="#eff6ff" />
          <circle cx="570" cy="260" r="8" fill="#3b82f6" />
          <text x="592" y="266" fill="#1d4ed8" fontFamily="Arial, sans-serif" fontSize="16" fontWeight="700">JPG</text>

          <text x="548" y="316" fill="#475569" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="700">RESIZE &amp; QUALITY</text>
          <rect x="548" y="334" width="244" height="16" rx="8" fill="#e5e7eb" />
          <rect className="product-slider-shimmer" x="548" y="334" width="192" height="16" rx="8" fill="url(#preview-progress)" />
          <circle cx="740" cy="342" r="15" fill="#ffffff" stroke="#3b82f6" strokeWidth="4.5" filter="url(#preview-handle-shadow)" />
          <text x="548" y="376" fill="#64748b" fontFamily="Arial, sans-serif" fontSize="13">Balanced for a clear, compact file</text>

          <g className="product-ready-float">
            <rect x="540" y="400" width="140" height="56" rx="21" fill="#ecfdf5" stroke="#bbf7d0" strokeWidth="2" />
            <circle cx="568" cy="428" r="15" fill="#22a35a" />
            <path d="M561 428l5 5 10-11" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <text x="594" y="435" fill="#15803d" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700">Ready</text>
          </g>
          <path className="product-action-pulse" d="M682 428h42m-14-14 14 14-14 14" fill="none" stroke="#e53935" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(754 428) scale(.95) translate(-767 -428)">
            <rect x="738" y="395" width="58" height="66" rx="13" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2" />
            <path d="M752 412h23l8 8v27h-31z" fill="#ffffff" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M775 412v9h8" fill="none" stroke="#f97316" strokeWidth="2.5" />
          </g>
        </g>
        </g>
      </g>

      <g className="product-flow-mobile">
        <circle cx="96" cy="96" r="96" fill="#e53935" opacity="0.04" />
        <circle cx="780" cy="452" r="108" fill="#0ea5a8" opacity="0.04" />
        <path d="M36 448c58-40 108-30 148 10" fill="none" stroke="#3b82f6" strokeWidth="22" strokeLinecap="round" opacity="0.02" />
        <ellipse cx="450" cy="530" rx="230" ry="25" fill="#22a35a" opacity="0.04" />
        <path d="M646 520c56 28 110 24 160-8" fill="none" stroke="#e53935" strokeWidth="12" strokeLinecap="round" opacity="0.02" />
        <g className="product-card-shell">
        <g className="product-card-shadow" filter="url(#preview-shadow)">
          <rect x="70" y="10" width="760" height="540" rx="46" fill="#ffffff" stroke="#e5e7eb" strokeWidth="3" />
        </g>
        <rect x="108" y="38" width="684" height="54" rx="18" fill="#f8fafc" />
        <rect x="130" y="53" width="24" height="24" rx="7" fill="#e53935" />
        <path d="M137 59h10v12h-10zM139 56h5l3 3h-8z" fill="#ffffff" />
        <text x="170" y="75" fill="#111827" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="700">{previewLabel}</text>
        <text x="760" y="75" textAnchor="end" fontFamily="Inter, Arial, sans-serif" fontSize="24" fontWeight="700" letterSpacing="-0.6"><tspan fill="#B91C1C">PDF</tspan><tspan fill="#111111">Root</tspan></text>

        <rect x="108" y="108" width="684" height="240" rx="28" fill="url(#preview-photo-bg)" stroke="#edf0f4" strokeWidth="1" filter="url(#preview-frame-shadow)" />
        {active === "jpg" ? (
          <g>
            <rect x="326" y="126" width="248" height="204" rx="18" fill="#ffffff" stroke="#bfdbfe" strokeWidth="4" />
            <path d="M366 176h168M366 208h168M366 240h122" stroke="#cbd5e1" strokeWidth="11" strokeLinecap="round" />
            <rect x="366" y="280" width="82" height="32" rx="9" fill="#fee2e2" />
            <text x="407" y="303" textAnchor="middle" fill="#c62828" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700">JPG</text>
          </g>
        ) : (
          <g>
            <g transform="translate(450 228) scale(.9) translate(-450 -228)">
              <circle cx="450" cy="194" r="55" fill="#f1c9a5" />
              <path d="M397 187c4-52 29-81 54-81 33 0 57 33 53 86-17-21-35-30-55-30-18 0-35 7-52 25z" fill="#334155" />
              <path d="M342 342c10-87 52-130 108-130s99 43 109 130" fill="#3b82f6" />
            </g>
            {active === "passport" && <rect x="380" y="122" width="140" height="212" rx="20" fill="none" stroke="#e53935" strokeWidth="4" strokeDasharray="11 9" />}
          </g>
        )}

        <text x="108" y="371" fill="#111827" fontFamily="Arial, sans-serif" fontSize="26" fontWeight="700">Output settings</text>
        <rect x="108" y="382" width="174" height="46" rx="23" fill="#fee2e2" />
        <circle cx="160" cy="405" r="9" fill="#e53935" />
        <text x="182" y="413" fill="#991b1b" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="700">20 KB</text>
        <rect x="294" y="382" width="286" height="46" rx="23" fill="#ecfeff" />
        <circle cx="354" cy="405" r="9" fill="#0ea5a8" />
        <text x="378" y="413" fill="#0f766e" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="700">200 × 230 px</text>
        <rect x="592" y="382" width="154" height="46" rx="23" fill="#eff6ff" />
        <circle cx="630" cy="405" r="9" fill="#3b82f6" />
        <text x="654" y="413" fill="#1d4ed8" fontFamily="Arial, sans-serif" fontSize="24" fontWeight="700">JPG</text>

        <text x="108" y="452" fill="#475569" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="700">RESIZE &amp; QUALITY</text>
        <rect x="108" y="460" width="300" height="16" rx="8" fill="#e5e7eb" />
        <rect className="product-slider-shimmer" x="108" y="460" width="235" height="16" rx="8" fill="url(#preview-progress)" />
        <circle cx="343" cy="468" r="15" fill="#ffffff" stroke="#3b82f6" strokeWidth="4.5" filter="url(#preview-handle-shadow)" />

        <g className="product-ready-float">
          <rect x="185" y="488" width="200" height="52" rx="20" fill="#ecfdf5" stroke="#bbf7d0" strokeWidth="2" />
          <circle cx="222" cy="514" r="16" fill="#22a35a" />
          <path d="M214 514l6 6 11-13" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="252" y="523" fill="#15803d" fontFamily="Arial, sans-serif" fontSize="25" fontWeight="700">Ready</text>
        </g>
        <path className="product-action-pulse" d="M415 514h80m-20-20 20 20-20 20" fill="none" stroke="#e53935" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(558 514) scale(.95) translate(-583 -514)">
          <rect x="548" y="482" width="70" height="64" rx="14" fill="#fff7ed" stroke="#fed7aa" strokeWidth="3" />
          <path d="M564 499h27l10 10v25h-37z" fill="#ffffff" stroke="#f97316" strokeWidth="3" strokeLinejoin="round" />
          <path d="M591 499v11h10" fill="none" stroke="#f97316" strokeWidth="3" />
        </g>
        </g>
      </g>
    </svg>
    </>
  );
}
