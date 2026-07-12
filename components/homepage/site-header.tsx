"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, FileOutput, Menu, Shapes, X } from "lucide-react";
import { Logo } from "@/components/homepage/logo";
import { ToolDirectoryIcon } from "@/components/ToolDirectoryIcon";
import { imageTools, pdfTools, tools, type Tool } from "@/lib/tools";

type OpenMenu = "convert" | "government" | "all" | null;

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

const conversionToolSlugs = [
  "pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint", "pdf-to-jpg", "jpg-to-pdf",
  "png-to-pdf", "word-to-pdf", "excel-to-pdf", "powerpoint-to-pdf",
];

const conversionTools = conversionToolSlugs.flatMap((slug) => {
  const tool = toolBySlug.get(slug);
  return tool ? [tool] : [];
});

const directNavItems = [
  { label: "Resize Image to Exact KB", href: "/resize-image-to-exact-kb", icon: toolBySlug.get("resize-image-to-exact-kb")!.icon, accent: "#9655a8" },
  { label: "Merge PDF", href: "/merge-pdf", icon: toolBySlug.get("merge-pdf")!.icon, accent: "#f0442e" },
  { label: "Crop Image", href: "/crop-image", icon: toolBySlug.get("crop-image")!.icon, accent: "#8b4bab" },
];

const mobileNavItems = [
  { label: "Government Recruitment Resize Tools", href: "/#gov-tools", icon: Shapes },
  { label: "All Tools", href: "/tools", icon: Menu },
];

const toolAccentColors: Record<string, string> = {
  "merge-pdf": "#f0442e", "split-pdf": "#f0442e", "compress-pdf": "#65a844",
  "pdf-to-word": "#3578d4", "pdf-to-excel": "#379447", "pdf-to-powerpoint": "#d94b20",
  "pdf-to-jpg": "#e9aa00", "jpg-to-pdf": "#e9aa00", "png-to-pdf": "#09a8b8",
  "word-to-pdf": "#3978d0", "excel-to-pdf": "#599b32", "powerpoint-to-pdf": "#e65a3e",
  "rotate-pdf": "#3e69df", "organize-pdf-pages": "#8b4bab", "delete-pdf-pages": "#ef492d",
  "watermark-pdf": "#97499a", "crop-pdf": "#4778df", "protect-pdf": "#4a9b38", "unlock-pdf": "#efa900",
  "resize-image-to-exact-kb": "#9655a8", "compress-image": "#68a83d", "background-remover": "#10afbd",
  "crop-image": "#8b4bab", "resize-image": "#3478df", "jpg-to-png": "#0abcc1", "png-to-jpg": "#10adcb",
  "passport-photo-maker": "#2f79e8", "signature-resize-tool": "#8547dd",
  "image-compressor-for-government-forms": "#69a959", "ssc-photo-resize": "#3478df", "rrb-photo-resize": "#6686d8",
  "ibps-photo-resize": "#4d83c9", "ojas-photo-resize": "#a748cf", "gpsc-photo-resize": "#4678dc",
  "upsc-photo-resize": "#5082cc", "front-back-card-merge": "#3e61d9",
};

function MegaMenuToolLink({ tool, onClick, touched, onTouchChange }: { tool: Tool; onClick: () => void; touched: boolean; onTouchChange: (touched: boolean) => void }) {
  const iconScale = tool.slug === "resize-image-to-exact-kb" ? "scale-[0.52]" : "scale-[0.7]";
  const accentColor = toolAccentColors[tool.slug] ?? "#FF2D2D";
  const accentStyle = { "--tool-accent": accentColor, "--tool-tint": `${accentColor}18` } as CSSProperties;
  return (
    <Link
      href={`/${tool.slug}`}
      onClick={onClick}
      onTouchStart={() => onTouchChange(true)}
      onTouchEnd={() => onTouchChange(false)}
      onTouchCancel={() => onTouchChange(false)}
      style={accentStyle}
      className={`flex h-10 min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[11px] font-medium leading-4 text-foreground outline-none transition-colors [@media(hover:hover)]:hover:bg-[var(--tool-tint)] [@media(hover:hover)]:hover:text-[var(--tool-accent)] focus-visible:bg-[var(--tool-tint)] focus-visible:text-[var(--tool-accent)] 2xl:text-xs ${touched ? "bg-[var(--tool-tint)] text-[var(--tool-accent)]" : ""}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent leading-none shadow-none [&_img]:border-0 [&_img]:bg-transparent [&_img]:mix-blend-multiply [&_img]:shadow-none" aria-hidden="true">
        <span className={`block h-11 w-11 shrink-0 origin-center border-0 bg-transparent leading-none shadow-none ${iconScale}`}>
          <ToolDirectoryIcon tool={tool} size="search" />
        </span>
      </span>
      <span className="flex min-h-8 min-w-0 items-center">
        <span className="line-clamp-2 min-w-0 break-words">{tool.name}</span>
      </span>
    </Link>
  );
}

export function HomepageSiteHeader() {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [touchedMegaTool, setTouchedMegaTool] = useState<string | null>(null);
  const [touchedDesktopNav, setTouchedDesktopNav] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
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
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
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

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-[#e5e7eb] bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between gap-5 px-6 lg:px-8">
        <Link href="/" aria-label="PDFRoot home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-2 xl:flex" aria-label="Main navigation">
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
              <div className="absolute left-1/2 top-full z-50 mt-2 w-[30rem] -translate-x-1/2 rounded-2xl border border-border bg-background p-2 shadow-2xl" role="menu" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                  {[conversionTools.slice(0, Math.ceil(conversionTools.length / 2)), conversionTools.slice(Math.ceil(conversionTools.length / 2))].map((column, columnIndex) => (
                    <div key={columnIndex} className="grid auto-rows-[2.5rem] gap-y-0">
                      {column.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative" onMouseEnter={() => openDesktopMenu("government")} onMouseLeave={scheduleClose}>
            <button type="button" onClick={() => openMenu === "government" ? closeDesktopMenu() : openDesktopMenu("government")} onTouchStart={() => setTouchedDesktopNav("government")} onTouchEnd={() => setTouchedDesktopNav(null)} onTouchCancel={() => setTouchedDesktopNav(null)} style={{ "--nav-accent": "#4a9b38" } as CSSProperties} className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors [@media(hover:hover)]:hover:text-[var(--nav-accent)] focus-visible:text-[var(--nav-accent)] 2xl:px-3 2xl:text-sm ${touchedDesktopNav === "government" ? "text-[var(--nav-accent)]" : ""}`} aria-expanded={openMenu === "government"} aria-haspopup="menu">
              Government Recruitment Resize Tools
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openMenu === "government" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {openMenu === "government" && (
              <div className="absolute left-1/2 top-full z-50 mt-2 w-[30rem] -translate-x-1/2 rounded-2xl border border-border bg-background p-2 shadow-2xl" role="menu" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
                <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                  {[governmentTools.slice(0, Math.ceil(governmentTools.length / 2)), governmentTools.slice(Math.ceil(governmentTools.length / 2))].map((column, columnIndex) => (
                    <div key={columnIndex} className="grid auto-rows-[2.5rem] gap-y-0">
                      {column.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div onMouseEnter={() => openDesktopMenu("all")} onMouseLeave={scheduleClose}>
            <button type="button" onClick={() => openMenu === "all" ? closeDesktopMenu() : openDesktopMenu("all")} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.78rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground 2xl:px-3 2xl:text-sm" aria-expanded={openMenu === "all"} aria-haspopup="menu">
              <Menu className="h-4 w-4 shrink-0" aria-hidden="true" />
              All Tools
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openMenu === "all" ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Link href="/login" className="inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90">
            Get Started
          </Link>
        </div>

        <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border xl:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {openMenu === "all" && (
        <div className="absolute inset-x-0 top-full hidden border-t border-border bg-background shadow-2xl xl:block" onMouseEnter={cancelScheduledClose} onMouseLeave={scheduleClose}>
          <div className="mx-auto grid max-h-[calc(100vh-4rem)] max-w-[1800px] grid-cols-2 gap-4 overflow-y-auto px-8 pb-1 pt-3">
            {[
              { label: "PDF Tools", items: pdfTools },
              { label: "Image Tools", items: imageTools },
            ].map((group) => (
              <section key={group.label}>
                <div className="grid grid-cols-2 items-stretch gap-x-1 gap-y-0 2xl:grid-cols-3">
                  {group.items.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={closeDesktopMenu} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} />)}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-border bg-background xl:hidden">
          <nav className="mx-auto flex max-w-[1800px] flex-col gap-1 px-6 py-4 lg:px-8">
            {directNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <details className="group/convert">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
                <FileOutput className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Convert PDF</span>
                <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open/convert:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid grid-cols-1 pl-3">
                {conversionTools.map((tool) => <MegaMenuToolLink key={tool.slug} tool={tool} onClick={() => { setTouchedMegaTool(null); setOpen(false); }} touched={touchedMegaTool === tool.slug} onTouchChange={(touched) => setTouchedMegaTool(touched ? tool.slug : null)} />)}
              </div>
            </details>
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/login" onClick={() => setOpen(false)} className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted">Sign in</Link>
              <Link href="/signup" onClick={() => setOpen(false)} className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">Get Started</Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
