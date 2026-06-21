import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import { InfoCard, InfoCta, InfoPageLayout } from "@/components/InfoPageLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Read the PDFRoot Terms and Conditions for using online PDF tools, image tools, file upload features, government form helpers, and document processing services.",
  alternates: {
    canonical: "/terms-and-conditions",
  },
  openGraph: {
    title: "Terms & Conditions | PDFRoot",
    description: "Simple terms for using PDFRoot PDF and image tools.",
    url: "https://pdfroot.com/terms-and-conditions",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms & Conditions | PDFRoot",
    description: "Simple terms for using PDFRoot PDF and image tools.",
    images: ["/pdfroot-og-image.png"],
  },
};

const sections = [
  {
    title: "Introduction",
    content:
      "Welcome to PDFRoot. These Terms & Conditions explain the basic rules for using our website and tools. By using PDFRoot, you agree to follow these terms.",
  },
  {
    title: "About PDFRoot",
    content:
      "PDFRoot provides online PDF and image tools for tasks such as converting, compressing, merging, splitting, resizing, cropping, organizing, protecting, and preparing files for online use.",
  },
  {
    title: "Use of Website",
    content:
      "You may use PDFRoot for personal, educational, office, business, and form preparation work. You must not use PDFRoot for illegal, harmful, abusive, or misleading activities.",
  },
  {
    title: "File Upload and Processing",
    content:
      "PDFRoot tools may require you to upload PDF, image, or document files. Uploaded files should be used only for the selected tool action. Some tools may process files directly in your browser, while other tools may require server-side processing if added in the future.",
  },
  {
    title: "User Responsibility",
    content:
      "You are responsible for the files you upload and the final output you download. Do not upload illegal, harmful, private, confidential, or highly sensitive files unless you understand the risk and need the file for your own task.",
  },
  {
    title: "Government Form Disclaimer",
    content:
      "PDFRoot is not an official government website and is not connected with SSC, RRB, IBPS, OJAS, GPSC, UPSC, or any government department. Government form requirements may change, so always verify the latest official notification before uploading your final files.",
  },
  {
    title: "Third-Party Links and Ads",
    content:
      "PDFRoot may include third-party links, ads, analytics, or external services. We are not responsible for the content, privacy policies, actions, or services of third-party websites.",
  },
  {
    title: "Limitation of Liability",
    content:
      "PDFRoot tries to provide useful and reliable tools, but tools may not always guarantee exact results, perfect formatting, exact file size, or compatibility with every form or website. PDFRoot is not responsible for losses, rejected uploads, data issues, or damages caused by using the website or downloaded files.",
  },
  {
    title: "Changes to Terms",
    content:
      "PDFRoot may update these Terms & Conditions from time to time. Changes will be posted on this page with an updated date. Continued use of PDFRoot means you accept the latest terms.",
  },
  {
    title: "Contact Us",
    content: "If you have questions about these Terms & Conditions, contact PDFRoot at support@pdfroot.com.",
  },
];

export default function TermsAndConditionsPage() {
  return (
    <InfoPageLayout eyebrow={<><BrandText styled /> Legal</>} title="Terms & Conditions" subtitle="Last updated: June 15, 2026">
      {sections.map((section) => (
        <InfoCard key={section.title} title={section.title}>
          <p>
            {section.title === "Contact Us" ? (
              <>
                If you have questions about these Terms & Conditions, contact <BrandText styled /> at{" "}
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
        <h2 className="text-3xl font-bold text-primary-foreground">Need help with <BrandText /> terms?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
          Contact us if you have questions about using <BrandText /> tools safely and correctly.
        </p>
        <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-background px-7 py-4 text-base font-medium text-foreground transition hover:-translate-y-0.5">
          Contact Support
          <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
        </Link>
      </InfoCta>
    </InfoPageLayout>
  );
}
