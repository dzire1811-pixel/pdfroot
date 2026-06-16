import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

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
    url: "https://pdfroot.com/faq",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | PDFRoot",
    description: "Common questions and answers about using PDFRoot PDF and image tools.",
    images: ["/pdfroot-og-image.png"],
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
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              PDFRoot Help
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              Frequently Asked Questions
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Simple answers about PDFRoot tools, file safety, government form helpers, mobile use, and support.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              {faqs.map((faq) => (
                <details key={faq.question} className="group p-6 open:bg-red-50/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-black text-slate-950">
                    {faq.question}
                    <ArrowRight className="h-5 w-5 shrink-0 text-[#FF2D2D] transition group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <p className="mt-4 leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>

            <div className="mt-10 rounded-3xl bg-[#FF2D2D] p-8 text-center text-white shadow-[0_24px_70px_rgba(255,45,45,0.22)] sm:p-10">
              <h2 className="text-3xl font-black text-white">Still need help?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-red-50">
                Contact PDFRoot support for questions about PDF tools, image tools, government form files, or upload issues.
              </p>
              <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-black text-slate-950 transition hover:-translate-y-0.5">
                Contact Support
                <ArrowRight className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema),
        }}
      />
    </>
  );
}
