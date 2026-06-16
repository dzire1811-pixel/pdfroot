import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

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
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Disclaimer | PDFRoot",
    description: "Important disclaimer for using PDFRoot PDF and image tools.",
    images: ["/pdfroot-og-image.png"],
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
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              PDFRoot Legal
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              Disclaimer
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Last updated: June 15, 2026
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {sections.map((section) => (
              <section key={section.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
                <h2 className="text-2xl font-black tracking-tight text-slate-950">{section.title}</h2>
                <p className="mt-4 text-base leading-8 text-slate-600">
                  {section.title === "Contact Us" ? (
                    <>
                      If you have questions about this Disclaimer, contact PDFRoot at{" "}
                      <a href="mailto:support@pdfroot.com" className="font-bold text-[#FF2D2D] hover:text-red-600">
                        support@pdfroot.com
                      </a>
                      .
                    </>
                  ) : (
                    section.content
                  )}
                </p>
              </section>
            ))}

            <div className="rounded-3xl bg-[#FF2D2D] p-8 text-center text-white shadow-[0_24px_70px_rgba(255,45,45,0.22)] sm:p-10">
              <h2 className="text-3xl font-black text-white">Need help understanding this disclaimer?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-red-50">
                Contact PDFRoot support if you have questions about file processing, government form tools, or safe website use.
              </p>
              <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-black text-slate-950 transition hover:-translate-y-0.5">
                Contact Support
                <ArrowRight className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
