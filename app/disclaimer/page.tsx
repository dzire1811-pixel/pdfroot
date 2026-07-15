import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import { InfoCard, InfoCta, InfoPageLayout } from "@/components/InfoPageLayout";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "Read the PDFRoot Disclaimer for general use of PDF tools, image tools, government form helpers, file processing, accuracy, third-party links, and user responsibility.",
  alternates: {
    canonical: "/disclaimer",
  },
  openGraph: {
    title: "Disclaimer | PDFRoot",
    description: "Important disclaimer for using PDFRoot PDF and image tools.",
    url: "https://pdfroot.com/disclaimer",
    images: ["https://pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Disclaimer | PDFRoot",
    description: "Important disclaimer for using PDFRoot PDF and image tools.",
    images: ["https://pdfroot.com/branding/twitter-card.png"],
  },
};

const sections = [
  {
    title: "General Information",
    content:
      "PDFRoot provides PDF and image tools for general use. Our tools are designed to help users convert, compress, resize, crop, merge, organize, and prepare files for everyday document work.",
  },
  {
    title: "File Processing Disclaimer",
    content:
      "Users are responsible for the files they upload and the final output they download. PDFRoot may process files in the browser or through available processing tools. Do not upload illegal, harmful, sensitive, private, or confidential files unless it is necessary for your own task.",
  },
  {
    title: "Government Form Disclaimer",
    content:
      "PDFRoot is not an official government website. PDFRoot is not connected with SSC, RRB, IBPS, OJAS, GPSC, UPSC, or any official portal. Users must always check the latest rules on the official website or official notification before uploading final files.",
  },
  {
    title: "Accuracy Disclaimer",
    content:
      "PDFRoot tries to provide useful and accurate tools, but we do not guarantee that every file will meet every portal requirement. File size, dimensions, formatting, quality, and upload acceptance may depend on the rules of the website where you submit the file.",
  },
  {
    title: "Third-Party Links and Ads",
    content:
      "PDFRoot may show third-party links, ads, analytics, or external services. We are not responsible for third-party websites, advertisements, privacy policies, services, or content.",
  },
  {
    title: "User Responsibility",
    content:
      "You are responsible for checking your final file before upload or submission. Please review file size, format, dimensions, readability, and official requirements before using the output from PDFRoot.",
  },
  {
    title: "No Professional Advice",
    content:
      "PDFRoot does not provide legal, government, technical, financial, or professional advice. Information on PDFRoot is provided only for general guidance and convenience.",
  },
  {
    title: "Contact Us",
    content: "If you have questions about this Disclaimer, contact PDFRoot at support@pdfroot.com.",
  },
];

export default function DisclaimerPage() {
  return (
    <InfoPageLayout eyebrow={<><BrandText styled /> Legal</>} title="Disclaimer" subtitle="Last updated: June 15, 2026">
      {sections.map((section) => (
        <InfoCard key={section.title} title={section.title}>
          <p>
            {section.title === "Contact Us" ? (
              <>
                If you have questions about this Disclaimer, contact <BrandText styled /> at{" "}
                <a href="mailto:support@pdfroot.com" className="font-semibold text-primary hover:text-primary/80">
                  support@pdfroot.com
                </a>
                .
              </>
            ) : (
              <BrandPhrase text={section.content} styled />
            )}
          </p>
        </InfoCard>
      ))}

      <InfoCta>
        <h2 className="text-3xl font-bold text-primary-foreground">Need help understanding this disclaimer?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
          Contact <BrandText /> support if you have questions about file processing, government form tools, or safe website use.
        </p>
        <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-background px-7 py-4 text-base font-medium text-foreground transition hover:-translate-y-0.5">
          Contact Support
          <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
        </Link>
      </InfoCta>
    </InfoPageLayout>
  );
}
