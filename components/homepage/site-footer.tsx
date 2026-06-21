import Link from "next/link";
import { BrandText } from "@/components/Brand";
import { SocialLinks } from "@/components/SocialLinks";
import { Logo } from "@/components/homepage/logo";
import type { Tool } from "@/lib/tools";

export function HomepageSiteFooter({ pdfTools, imageTools, governmentTools }: { pdfTools: Tool[]; imageTools: Tool[]; governmentTools: Tool[] }) {
  const columns = [
    {
      title: "Company",
      links: [
        { label: "About Us", href: "/about" },
        { label: "Contact Us", href: "/contact" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      title: "Tools",
      links: [...pdfTools.slice(0, 2), ...imageTools.slice(0, 2)].map((tool) => ({ label: tool.name, href: `/${tool.slug}` })),
    },
    {
      title: "Government",
      links: governmentTools.slice(0, 4).map((tool) => ({ label: tool.name, href: `/${tool.slug}` })),
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy-policy" },
        { label: "Terms & Conditions", href: "/terms-and-conditions" },
        { label: "Disclaimer", href: "/disclaimer" },
      ],
    },
  ];

  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Every PDF &amp; image tool you need - fast, private and built for government form applications.
            </p>
            <SocialLinks className="mt-5" linkClassName="text-muted-foreground hover:text-foreground" />
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Copyright 2026 <BrandText styled />. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">Made for students &amp; cyber cafes across India.</p>
        </div>
      </div>
    </footer>
  );
}
