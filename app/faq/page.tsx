import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import { InfoCta, InfoPageLayout } from "@/components/InfoPageLayout";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Find answers to common questions about PDFRoot PDF tools, image tools, exact KB resize, government form photo and signature resize, file safety, and support.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "FAQ | PDFRoot",
    description: "Common questions and answers about using PDFRoot PDF and image tools.",
    url: "https://www.pdfroot.com/faq",
    images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | PDFRoot",
    description: "Common questions and answers about using PDFRoot PDF and image tools.",
    images: ["https://www.pdfroot.com/branding/twitter-card.png"],
  },
};

const faqs = [
  {
    question: "What is PDFRoot?",
    answer:
      "PDFRoot is a free online PDF and image toolkit. It helps users convert, compress, resize, crop, merge, split, organize, and prepare files for daily document work.",
  },
  {
    question: "Is PDFRoot free to use?",
    answer:
      "Yes, PDFRoot provides free online PDF and image tools. Some advanced or future premium features may be added later, but common tools are designed for easy daily use.",
  },
  {
    question: "Which tools are available on PDFRoot?",
    answer:
      "PDFRoot includes tools such as JPG to PDF, PDF to JPG, Merge PDF, Split PDF, Compress PDF, Rotate PDF, Protect PDF, Unlock PDF, Resize Image to Exact KB, Compress Image, Crop Image, Resize Image, Passport Photo Maker, Signature Resize Tool, and government form helper tools.",
  },
  {
    question: "Can I resize image to exact KB?",
    answer:
      "Yes. PDFRoot includes a Resize Image to Exact KB tool. You can upload an image, enter a target KB size, preview the result, and download the optimized file.",
  },
  {
    question: "Can I resize photo and signature for government forms?",
    answer:
      "Yes. PDFRoot provides photo and signature resize tools for common online form work. Users should always verify the latest official upload rules before submitting files on any government or exam portal.",
  },
  {
    question: "Can I convert JPG to PDF?",
    answer:
      "Yes. The JPG to PDF tool lets you upload one or multiple images, arrange them, convert them into one PDF, and download the final PDF file.",
  },
  {
    question: "Can I convert PDF to JPG?",
    answer:
      "Yes. The PDF to JPG tool can convert PDF pages into JPG images and lets you download converted images.",
  },
  {
    question: "Can I compress PDF and images?",
    answer:
      "Yes. PDFRoot has tools for compressing PDF files and image files. Compression results may vary depending on the original file size, quality, and content.",
  },
  {
    question: "Are uploaded files safe?",
    answer:
      "PDFRoot is designed with user privacy and safe file handling in mind. Many tools process files in the browser where possible. Users should still avoid uploading highly sensitive or confidential files unless necessary.",
  },
  {
    question: "Does PDFRoot store my uploaded files?",
    answer:
      "PDFRoot tools are designed for processing files for the selected action. Browser-based tools may not upload files to a server. If any tool requires server-side processing in the future, files should be used only for processing and should not be stored permanently.",
  },
  {
    question: "Is PDFRoot an official government website?",
    answer:
      "No. PDFRoot is not an official government website and is not connected with SSC, RRB, IBPS, OJAS, GPSC, UPSC, or any official portal.",
  },
  {
    question: "Can I use PDFRoot on mobile?",
    answer:
      "Yes. PDFRoot is designed to work on mobile, tablet, and desktop devices so students, government job applicants, cyber cafe users, office users, and general users can work from anywhere.",
  },
  {
    question: "What should I do if a tool is not working?",
    answer:
      "Try refreshing the page, checking your file type, reducing the file size, or using a different browser. If the issue continues, contact PDFRoot support and mention the tool name, file type, and what problem you are seeing.",
  },
  {
    question: "How can I contact PDFRoot?",
    answer:
      "You can contact PDFRoot by email at support@pdfroot.com or by using the Contact Us page.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <InfoPageLayout
      eyebrow={<><BrandText styled /> Help</>}
      title="Frequently Asked Questions"
      subtitle={<>Simple answers about <BrandText styled /> tools, file safety, government form helpers, mobile use, and support.</>}
    >
      <section className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {faqs.map((faq) => (
          <details key={faq.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-foreground sm:px-6">
              <span className="min-w-0"><BrandPhrase text={faq.question} styled /></span>
              <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-open:rotate-90" aria-hidden="true" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6">
              <BrandPhrase text={faq.answer} styled />
            </p>
          </details>
        ))}
      </section>

      <InfoCta>
        <h2 className="text-3xl font-bold text-primary-foreground">Still need help?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
          Contact <BrandText /> support for questions about PDF tools, image tools, government form files, or upload issues.
        </p>
        <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-background px-7 py-4 text-base font-medium text-foreground transition hover:-translate-y-0.5">
          Contact Support
          <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
        </Link>
      </InfoCta>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema),
        }}
      />
    </InfoPageLayout>
  );
}
