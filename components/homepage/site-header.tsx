"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FileOutput, Home, Menu, Shapes, X } from "lucide-react";
import { Logo } from "@/components/homepage/logo";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { getToolRowTintStyle } from "@/lib/toolInteractionColors";
import { imageTools, pdfTools, tools, type Tool } from "@/lib/tools";

type OpenMenu = "convert" | "government" | "all" | null;
type MobileNavSection = "convert" | "government" | "all";

const toolBySlug = new Map(tools.map((tool) => [tool.slug, tool]));

const governmentToolSlugs = [
  "image-compressor-for-government-forms",
  "signature-resize-tool",
  "ssc-photo-resize",
  "rrb-photo-resize",
  "ibps-photo-resize",
  "ojas-photo-resize",
  "gpsc-photo-resize",
  "upsc-photo-resize",
  "passport-photo-maker",
  "front-back-card-merge",
];

const governmentTools = governmentToolSlugs.flatMap((slug) => {
  const tool = toolBySlug.get(slug);
  return tool ? [tool] : [];
});

const mobileGovernmentTools = imageTools.filter((tool) => tool.government);
const standardImageTools = imageTools.filter((tool) => !tool.government);
const allToolGroups = [
  { label: "PDF Tools", items: pdfTools },
  { label: "Image Tools", items: standardImageTools },
  { label: "Recruitment Resize Tools", items: mobileGovernmentTools },
];
const compactMenuToolLabels: Record<string, string> = {
  "image-compressor-for-government-forms": "Govt. Form Image Compressor",
  "ibps-photo-resize": "IBPS Photo, Sign, Thumb & Decl.",
};

const conversionToolSlugs = [
  "pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint", "pdf-to-jpg", "jpg-to-pdf",
  "png-to-pdf", "word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf",
];

const conversionTools = conversionToolSlugs.flatMap((slug) => {
  const tool = toolBySlug.get(slug);
  return tool ? [tool] : [];
});

const directNavItems = [
  { label: "Resize Image to Exact KB", href: "/resize-image-to-exact-kb", tool: toolBySlug.get("resize-image-to-exact-kb")!, accent: "#9655a8" },
  { label: "Merge PDF", href: "/merge-pdf", tool: toolBySlug.get("merge-pdf")!, accent: "#f0442e" },
  { label: "Crop Image", href: "/crop-image", tool: toolBySlug.get("crop-image")!, accent: "#8b4bab" },
];

function MegaMenuToolLink({ tool, onClick, touched, onTouchChange, mobileReadable = false, mobileSingleLine = false, desktopCompact = false, displayName }: { tool: Tool; onClick: () => void; touched: boolean; onTouchChange: (touched: boolean) => void; mobileReadable?: boolean; mobileSingleLine?: boolean; desktopCompact?: boolean; displayName?: string }) {
  return (
    <Link
      href={`/${tool.slug}`}
      onClick={onClick}
      onTouchStart={() => onTouchChange(true)}
      onTouchEnd={() => onTouchChange(false)}
      onTouchCancel={() => onTouchChange(false)}
      style={getToolRowTintStyle(tool.slug)}
      data-mobile-readable-tool={mobileReadable ? "true" : undefined}
      className={`group flex min-w-0 rounded-xl font-normal text-sm text-foreground outline-none transition-[background-color,color] duration-200 hover:bg-[var(--tool-row-tint)] hover:text-[var(--tool-row-color)] focus-visible:bg-[var(--tool-row-tint)] focus-visible:text-[var(--tool-row-color)] focus-visible:ring-2 focus-visible:ring-[var(--tool-row-color)] focus-visible:ring-offset-1 active:bg-[var(--tool-row-tint)] ${mobileReadable ? "h-full min-h-11 items-center gap-2 px-2 py-1 leading-[1.25]" : desktopCompact ? "h-11 items-start gap-2 px-2 py-2.5 leading-[1.25]" : "h-11 items-center gap-2 px-2 py-1.5 leading-[1.25]"} ${touched ? "bg-[var(--tool-row-tint)] text-[var(--tool-row-color)]" : ""}`}
    >
      <span className={`${mobileReadable || desktopCompact ? "flex h-[22px] w-[22px] items-center justify-center" : "flex h-8 w-8 items-center justify-center"} shrink-0 border-0 bg-transparent leading-none shadow-none transition-transform duration-200 group-hover:scale-[1.04] group-focus-visible:scale-[1.04] [&_img]:border-0 [&_img]:bg-transparent [&_img]:shadow-none`} aria-hidden="true">
        {mobileReadable || desktopCompact ? (
          <ToolDirectoryIcon tool={tool} />
        ) : (
          <span className="block h-8 w-8 shrink-0 border-0 bg-transparent leading-none shadow-none">
            <ToolDirectoryIcon tool={tool} />
          </span>
        )}
      </span>
      <span className={`flex min-w-0 ${mobileReadable ? "min-h-0 items-center" : "min-h-0 items-start"}`}>
        <span className={mobileSingleLine ? "min-w-0 whitespace-nowrap" : "line-clamp-2 min-w-0 break-words leading-[1.25]"}>{displayName ?? tool.name}</span>
      </span>
    </Link>
  );
}

export function HomepageSiteHeader() {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileExpandedSection, setMobileExpandedSection] = useState<MobileNavSection | null>(null);
  const [mobileMenuTop, setMobileMenuTop] = useState(0);
  const [touchedMegaTool, setTouchedMegaTool] = useState<string | null>(null);
  const [touchedDesktopNav, setTouchedDesktopNav] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuPanelRef = useRef<HTMLDivElement>(null);
  const mobileScrollPositionRef = useRef({ x: 0, y: 0 });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelScheduledClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openDesktopMenu(menu: Exclude<OpenMenu, null>) {
    cancelScheduledClose();
    setOpenMenu(menu);
  }

  function scheduleClose() {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => setOpenMenu(null), 140);
  }

  function closeDesktopMenu() {
    cancelScheduledClose();
    setTouchedMegaTool(null);
    setOpenMenu(null);
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const isInsideMobilePanel = mobileMenuPanelRef.current?.contains(target) ?? false;
      const isInsideMobileTrigger = mobileMenuButtonRef.current?.contains(target) ?? false;
      const isInsideHeader = headerRef.current?.contains(target) ?? false;
      if (mobileMenuPanelRef.current && !isInsideMobilePanel && !isInsideMobileTrigger) {
        setTouchedMegaTool(null);
        setMobileExpandedSection(null);
        setIsMobileMenuOpen(false);
      }
      if (headerRef.current && !isInsideHeader && !isInsideMobilePanel) {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
        setTouchedMegaTool(null);
        setOpenMenu(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
        setOpenMenu(null);
        setMobileExpandedSection(null);
        setIsMobileMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    mobileScrollPositionRef.current = scrollPosition;
    const previousBodyOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.documentElement.style.scrollBehavior = "auto";

    function updateMobileMenuTop() {
      setMobileMenuTop(headerRef.current?.getBoundingClientRect().bottom ?? 0);
    }

    function preserveBackgroundScroll() {
      if (window.scrollX !== scrollPosition.x || window.scrollY !== scrollPosition.y) {
        window.scrollTo(scrollPosition.x, scrollPosition.y);
      }
    }

    function preventBackgroundTouchMove(event: TouchEvent) {
      if (!mobileMenuPanelRef.current?.contains(event.target as Node)) {
        event.preventDefault();
      }
    }

    updateMobileMenuTop();
    window.addEventListener("resize", updateMobileMenuTop);
    window.addEventListener("scroll", preserveBackgroundScroll, { passive: true });
    document.addEventListener("touchmove", preventBackgroundTouchMove, { passive: false });
    return () => {
      window.removeEventListener("resize", updateMobileMenuTop);
      window.removeEventListener("scroll", preserveBackgroundScroll);
      document.removeEventListener("touchmove", preventBackgroundTouchMove);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousOverscrollBehavior;
      window.scrollTo(mobileScrollPositionRef.current.x, mobileScrollPositionRef.current.y);
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    };
  }, [isMobileMenuOpen]);

  function closeMobileMenu() {
    setTouchedMegaTool(null);
    setMobileExpandedSection(null);
    setIsMobileMenuOpen(false);
  }

  function toggleMobileMenu() {
    if (isMobileMenuOpen) {
      closeMobileMenu();
      return;
    }
    setMobileMenuTop(headerRef.current?.getBoundingClientRect().bottom ?? 0);
    setMobileExpandedSection(null);
    setIsMobileMenuOpen(true);
  }

  const mobileDirectLinks = [
    { label: "Home", href: "/", icon: Home, accent: "#FF2D2D" },
    ...directNavItems,
  ];

  const mobileAccordionSections = [
    { id: "convert" as const, label: "Convert PDF", items: conversionTools, icon: FileOutput, accent: "#d94b20" },
    { id: "government" as const, label: "Recruitment Resize Tools", items: mobileGovernmentTools, icon: Shapes, accent: "#4a9b38" },
    { id: "all" as const, label: "All Tools", items: tools, icon: Menu, accent: "#64748b" },
  ];

  const mobileMenuOverlay = isMobileMenuOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={mobileMenuPanelRef}
          id="mobile-tools-menu"
          className="fixed left-0 right-0 z-[100] flex w-screen flex-col overflow-hidden border-t border-border bg-background shadow-2xl min-[1320px]:hidden"
          style={{
            "--mobile-header-height": `${mobileMenuTop}px`,
            top: "var(--mobile-header-height)",
            height: "calc(100dvh - var(--mobile-header-height))",
          } as CSSProperties}
          role="menu"
          aria-label="Mobile navigation menu"
        >
          <div data-mobile-menu-actions className="sticky top-0 z-30 flex h-11 shrink-0 items-start justify-end border-b border-border bg-white px-3">
            <button type="button" onClick={closeMobileMenu} className="grid h-11 w-11 shrink-0 place-items-center text-foreground" aria-label="Close mobile menu">
              <span data-mobile-close-visual className="grid h-8 w-8 place-items-center rounded-lg border border-border transition-colors hover:bg-muted">
                <X className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          </div>
          <div data-mobile-menu-scroll-region className="min-h-0 w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-[1800px] space-y-2 py-3">
            {mobileDirectLinks.map((item) => {
              const itemStyle = { "--mobile-accent": item.accent, "--mobile-tint": `${item.accent}12` } as CSSProperties;
              return (
                <Link key={item.label} href={item.href} onClick={closeMobileMenu} style={itemStyle} className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-[var(--mobile-tint)] px-3 py-3 text-sm text-foreground transition-colors active:text-[var(--mobile-accent)]">
                  {"tool" in item ? (
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center"><ToolDirectoryIcon tool={item.tool} /></span>
                  ) : (() => {
                    const Icon = item.icon;
                    return <Icon className="h-5 w-5 shrink-0 text-[var(--mobile-accent)]" aria-hidden="true" />;
                  })()}
                  <span className={"tool" in item ? "font-normal" : "font-medium"}>{item.label}</span>
                </Link>
              );
            })}
            {mobileAccordionSections.map((section) => {
              const isExpanded = mobileExpandedSection === section.id;
              const Icon = section.icon;
              const sectionStyle = { "--mobile-accent": section.accent, "--mobile-tint": `${section.accent}12` } as CSSProperties;
              return (
                <section key={section.id} className={`overflow-hidden rounded-xl border border-transparent bg-background ${section.id === "all" && mobileExpandedSection === "government" ? "!-mt-0.5" : ""}`}>
                  <button type="button" onClick={() => setMobileExpandedSection((current) => current === section.id ? null : section.id)} style={sectionStyle} className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-[var(--mobile-tint)] px-3 py-3 text-left text-sm font-medium text-foreground" aria-expanded={isExpanded} aria-controls={`mobile-nav-section-${section.id}`}>
                    <Icon className="h-5 w-5 shrink-0 text-[var(--mobile-accent)]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{section.label}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--mobile-accent)] transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {isExpanded && (section.id === "all" ? (
                    <div id={`mobile-nav-section-${section.id}`} className="space-y-0 px-1 pb-3 pt-0 md:space-y-3 md:pt-1">
                      {allToolGroups.map((group) => (
                        <section key={group.label} aria-labelledby={`mobile-${section.id}-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                          <h3 id={`mobile-${section.id}-${group.label.toLowerCase().replace(/\s+/g, "-")}`} className="px-2 pb-3.5 pt-3 text-[15px] font-semibold leading-5 text-zinc-800 md:pb-1.5 md:pt-1 md:text-xs md:leading-4">
                            {group.label}
                          </h3>
                          <div className="grid grid-cols-1 items-stretch gap-y-0 [grid-auto-rows:44px]">
                            {group.items.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeMobileMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} mobileReadable displayName={compactMenuToolLabels[tool.slug]} />)}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div id={`mobile-nav-section-${section.id}`} className="grid grid-cols-1 items-stretch gap-y-0 px-1 pb-2 pt-1 [grid-auto-rows:44px]">
                      {section.items.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeMobileMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} mobileReadable mobileSingleLine displayName={section.id === "government" ? compactMenuToolLabels[tool.slug] : undefined} />)}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-[#e5e7eb] bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between gap-5 px-6 lg:px-8">
        <Link href="/" aria-label="PDFRoot home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-[14px] min-[1320px]:flex" aria-label="Main navigation">
          {directNavItems.map((item) => {
            return (
              <Link key={item.label} href={item.href} onClick={closeDesktopMenu} onTouchStart={() => setTouchedDesktopNav(item.label)} onTouchEnd={() => setTouchedDesktopNav(null)} onTouchCancel={() => setTouchedDesktopNav(null)} style={{ "--nav-accent": item.accent } as CSSProperties} className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors [@media(hover:hover)]:hover:text-[var(--nav-accent)] focus-visible:text-[var(--nav-accent)] 2xl:px-3 2xl:text-sm ${touchedDesktopNav === item.label ? "text-[var(--nav-accent)]" : ""}`}>
                {item.label}
              </Link>
            );
          })}

          <div className="relative" onMouseEnter={() => openDesktopMenu("convert")} onMouseLeave={scheduleClose}>
            <button type="button" onClick={() => openMenu === "convert" ? closeDesktopMenu() : openDesktopMenu("convert")} onTouchStart={() => setTouchedDesktopNav("convert")} onTouchEnd={() => setTouchedDesktopNav(null)} onTouchCancel={() => setTouchedDesktopNav(null)} style={{ "--nav-accent": "#d94b20" } as CSSProperties} className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors [@media(hover:hover)]:hover:text-[var(--nav-accent)] focus-visible:text-[var(--nav-accent)] 2xl:px-3 2xl:text-sm ${touchedDesktopNav === "convert" ? "text-[var(--nav-accent)]" : ""}`} aria-expanded={openMenu === "convert"} aria-haspopup="menu">
              Convert PDF
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openMenu === "convert" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {openMenu === "convert" && (
              <div className="absolute left-1/2 top-full z-50 mt-2 w-[520px] -translate-x-1/2 rounded-2xl border border-border bg-background px-5 py-4 shadow-2xl" role="menu" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
                <div className="grid grid-cols-2 gap-x-7">
                  {[conversionTools.slice(0, Math.ceil(conversionTools.length / 2)), conversionTools.slice(Math.ceil(conversionTools.length / 2))].map((column, columnIndex) => (
                    <div key={columnIndex} className="grid auto-rows-[2.5rem] gap-y-0">
                      {column.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} desktopCompact />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative" onMouseEnter={() => openDesktopMenu("government")} onMouseLeave={scheduleClose}>
            <button type="button" onClick={() => openMenu === "government" ? closeDesktopMenu() : openDesktopMenu("government")} onTouchStart={() => setTouchedDesktopNav("government")} onTouchEnd={() => setTouchedDesktopNav(null)} onTouchCancel={() => setTouchedDesktopNav(null)} style={{ "--nav-accent": "#4a9b38" } as CSSProperties} className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors [@media(hover:hover)]:hover:text-[var(--nav-accent)] focus-visible:text-[var(--nav-accent)] 2xl:px-3 2xl:text-sm ${touchedDesktopNav === "government" ? "text-[var(--nav-accent)]" : ""}`} aria-expanded={openMenu === "government"} aria-haspopup="menu">
              Recruitment Resize Tools
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openMenu === "government" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {openMenu === "government" && (
              <div className="absolute left-1/2 top-full z-50 mt-2 w-[600px] -translate-x-1/2 rounded-2xl border border-border bg-background px-5 py-4 shadow-2xl" role="menu" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
                <div className="grid grid-cols-2 gap-x-7">
                  {[governmentTools.slice(0, Math.ceil(governmentTools.length / 2)), governmentTools.slice(Math.ceil(governmentTools.length / 2))].map((column, columnIndex) => (
                    <div key={columnIndex} className="grid auto-rows-[2.5rem] gap-y-0">
                      {column.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} desktopCompact displayName={compactMenuToolLabels[tool.slug]} />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div onMouseEnter={() => openDesktopMenu("all")} onMouseLeave={scheduleClose}>
            <button type="button" onClick={() => openMenu === "all" ? closeDesktopMenu() : openDesktopMenu("all")} className="inline-flex h-10 shrink-0 items-center !gap-0 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground 2xl:px-3 2xl:text-sm" aria-expanded={openMenu === "all"} aria-haspopup="menu">
              <Menu className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
              All Tools
              <ChevronDown className={`ml-1.5 h-3.5 w-3.5 shrink-0 transition-transform ${openMenu === "all" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 min-[1320px]:flex">
          <Link href="/login" className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90">
            Get Started
          </Link>
        </div>

        <button ref={mobileMenuButtonRef} type="button" onClick={toggleMobileMenu} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-foreground min-[1320px]:hidden" aria-label={isMobileMenuOpen ? "Close mobile menu" : "Open mobile menu"} aria-expanded={isMobileMenuOpen} aria-controls="mobile-tools-menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

      </div>

      {openMenu === "all" && (
        <div data-all-tools-mega-menu className="absolute inset-x-0 top-full hidden border-t border-border bg-background shadow-2xl min-[1320px]:block" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
          <div className="mx-auto max-h-[calc(100vh-4rem)] w-[68%] max-w-[1300px] overflow-y-auto pb-4 pt-4">
            <section aria-labelledby="desktop-pdf-tools">
              <h3 id="desktop-pdf-tools" className="mb-3 px-2 text-base font-semibold leading-tight text-zinc-800">
                {allToolGroups[0].label}
              </h3>
              <div data-all-tools-menu-grid className="grid grid-cols-5 items-stretch gap-x-2 gap-y-0 [grid-auto-rows:44px]">
                {allToolGroups[0].items.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} desktopCompact displayName={compactMenuToolLabels[tool.slug]} />)}
              </div>
            </section>

            <div className="mt-5 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-6">
              {allToolGroups.slice(1).map((group) => (
                <section key={group.label} aria-labelledby={`desktop-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <h3 id={`desktop-${group.label.toLowerCase().replace(/\s+/g, "-")}`} className="mb-3 px-2 text-base font-semibold leading-tight text-zinc-800">
                    {group.label}
                  </h3>
                  <div data-all-tools-menu-grid className="grid grid-cols-2 items-stretch gap-x-2 gap-y-0 [grid-auto-rows:44px]">
                    {group.items.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} desktopCompact displayName={compactMenuToolLabels[tool.slug]} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

    </header>
    {mobileMenuOverlay}
    </>
  );
}
