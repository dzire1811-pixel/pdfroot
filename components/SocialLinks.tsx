import type { ReactNode } from "react";

type SocialLink = {
  label: string;
  href: string;
  icon: ReactNode;
};

const socialLinks: SocialLink[] = [
  {
    label: "Instagram",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 8.5h2.5V4.6a14 14 0 0 0-3.6-.3c-3.6 0-6 2.1-6 6v3.4H3v4.4h3.9V24h4.7v-5.9h3.7l.6-4.4h-4.3v-3c0-1.3.4-2.2 2.4-2.2Z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v12H3v-12Zm6.5 0h3.8v1.65h.05c.53-1 1.82-2.05 3.75-2.05 4.02 0 4.9 2.65 4.9 6.1v6.3h-4v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.15 1.46-2.15 2.96v5.7h-4v-12Z" />
      </svg>
    ),
  },
  {
    label: "X",
    href: "#",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-6.4L6.45 22H3.33l7.25-8.29L2.92 2h6.4l4.43 5.86L18.9 2Zm-1.1 17.84h1.72L8.38 4.05H6.54l11.26 15.79Z" />
      </svg>
    ),
  },
];

export function SocialLinks({ className = "", linkClassName = "" }: { className?: string; linkClassName?: string }) {
  return (
    <div className={`flex items-center justify-center gap-4 ${className}`} aria-label="Social media links">
      {socialLinks.map((social) => (
        social.href === "#" ? (
          <span
            key={social.label}
            aria-label={`${social.label} coming soon`}
            className={`inline-flex h-5 w-5 items-center justify-center opacity-60 ${linkClassName}`}
          >
            <span className="sr-only">{social.label}</span>
            <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-2 [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&_path]:fill-current [&_path]:stroke-none">
              {social.icon}
            </span>
          </span>
        ) : (
          <a
            key={social.label}
            href={social.href}
            target="_blank"
            rel="noreferrer"
            aria-label={social.label}
            className={`inline-flex h-5 w-5 items-center justify-center transition-colors ${linkClassName}`}
          >
          <span className="sr-only">{social.label}</span>
          <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-2 [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&_path]:fill-current [&_path]:stroke-none">
            {social.icon}
          </span>
          </a>
        )
      ))}
    </div>
  );
}
