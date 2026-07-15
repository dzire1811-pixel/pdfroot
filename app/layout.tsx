import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = "https://pdfroot.com";

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
  manifest: "/branding/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/branding/favicon.ico", type: "image/x-icon" },
      { url: "/branding/favicon.svg", type: "image/svg+xml" },
      { url: "/branding/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/branding/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={inter.variable}>
      <body className="font-sans">
        {children}
        <Script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
      </body>
    </html>
  );
}
