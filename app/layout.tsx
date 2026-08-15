import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import type { ReactNode } from "react";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { DeferredSpeedInsights } from "@/components/DeferredSpeedInsights";
import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  isAnalyticsConsentChoice,
} from "@/lib/analyticsConsent";
import "./globals.css";
import "./homepage.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "optional",
});

const siteUrl = "https://www.pdfroot.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "PDFRoot - Smart PDF & Image Toolkit",
    template: "%s | PDFRoot",
  },
  description:
    "Convert, compress, merge, split, edit, organize PDFs and images with PDFRoot, a smart PDF and image toolkit.",
  applicationName: "PDFRoot",
  keywords: [
    "PDF tools",
    "image tools",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "JPG to PDF",
    "PDF to JPG",
    "resize image to exact KB",
    "ssc signature resize",
    "rrb signature resize",
    "ibps photo resize",
    "ojas photo resize",
    "upsc photo resize",
    "gpsc photo resize",
    "government form photo resize",
    "signature resize online",
    "resize image to 20kb",
    "resize image to 50kb",
    "resize image to 100kb",
  ],
  authors: [{ name: "PDFRoot" }],
  creator: "PDFRoot",
  publisher: "PDFRoot",
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "PDFRoot - Smart PDF & Image Toolkit",
    description:
      "All PDF and image tools in one place. Convert, compress, merge, split, edit, organize, and resize files online.",
    url: siteUrl,
    siteName: "PDFRoot",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: `${siteUrl}/branding/open-graph-image.png`,
        width: 1200,
        height: 630,
        alt: "PDFRoot logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PDFRoot - Smart PDF & Image Toolkit",
    description:
      "Convert, compress, merge, split, edit, organize PDFs and images with PDFRoot.",
    images: [`${siteUrl}/branding/twitter-card.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PDFRoot",
  url: siteUrl,
  logo: `${siteUrl}/branding/logo.png`,
  image: `${siteUrl}/branding/open-graph-image.png`,
  sameAs: [
    "https://twitter.com/pdfroot",
    "https://www.linkedin.com/company/pdfroot",
    "https://www.facebook.com/pdfroot",
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieStore = await cookies();
  const storedConsent = cookieStore.get(ANALYTICS_CONSENT_COOKIE_NAME)?.value;
  const initialConsent = isAnalyticsConsentChoice(storedConsent) ? storedConsent : null;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-analytics-consent={initialConsent ?? "pending"}
      className={inter.variable}
    >
      <body className="font-sans">
        {children}
        <Script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <AnalyticsConsent initialConsent={initialConsent} />
        <DeferredSpeedInsights />
      </body>
    </html>
  );
}
