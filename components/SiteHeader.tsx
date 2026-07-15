import { Menu } from "lucide-react";
import Link from "next/link";
import { HorizontalLogo } from "@/components/Logo";

const navItems = [
  { label: "PDF Tools", href: "/#pdf-tools" },
  { label: "Image Tools", href: "/#image-tools" },
  { label: "Government Form Tools", href: "/#government-tools" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Blog", href: "/blog" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#e5e7eb] bg-white shadow-sm">
      <nav className="mx-auto grid min-h-16 max-w-[1800px] grid-cols-[1fr_auto] items-center gap-4 px-6 py-3 sm:min-h-20 lg:grid-cols-[1fr_auto_1fr] lg:px-8" aria-label="Main navigation">
        <Link href="/" className="inline-flex rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-500" aria-label="PDFRoot home">
          <HorizontalLogo />
        </Link>
        <div className="hidden items-center justify-center gap-6 lg:flex">
          {navItems.map((item) => (
            <a key={item.label} href={item.href} className="rounded-md text-sm font-bold text-slate-700 transition hover:text-[#FF2D2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-500">
              {item.label}
            </a>
          ))}
        </div>
        <div className="flex items-center justify-end">
          <div className="hidden items-center justify-end gap-3 lg:flex">
            <Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100">
              Login
            </Link>
            <Link href="/signup" className="rounded-full bg-[#FF2D2D] px-5 py-2.5 text-sm font-black text-white shadow-[0_12px_30px_rgba(255,45,45,0.22)] transition duration-300 hover:-translate-y-0.5 hover:bg-red-600">
              Sign Up
            </Link>
          </div>
          <details className="relative lg:hidden">
            <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-slate-200 text-slate-900">
              <span className="sr-only">Open menu</span>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-14 w-72 rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl">
              {navItems.map((item) => (
                <a key={item.label} href={item.href} className="block rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  {item.label}
                </a>
              ))}
              <Link href="/login" className="mt-2 block rounded-2xl px-4 py-3 text-center text-sm font-black text-slate-700 hover:bg-slate-50">
                Login
              </Link>
              <Link href="/signup" className="block rounded-2xl bg-[#FF2D2D] px-4 py-3 text-center text-sm font-black text-white">
                Sign Up
              </Link>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
