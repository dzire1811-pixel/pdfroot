import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, ShieldCheck, Timer } from "lucide-react";
import { BrandText, LogoMark, SectionHeading } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialLinks } from "@/components/SocialLinks";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";

export const metadata: Metadata = {
  title: "Contact PDFRoot",
  description:
    "Contact PDFRoot support for help with PDF tools, image tools, exact KB resize, government form tools, file conversion, and document preparation.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact PDFRoot | Support",
    description: "Get help with PDFRoot PDF and image tools. Contact support at support@pdfroot.com.",
    url: "https://pdfroot.com/contact",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact PDFRoot | Support",
    description: "Get help with PDFRoot PDF and image tools.",
    images: ["/pdfroot-og-image.png"],
  },
};

const helpTopics = [
  "PDF conversion tools",
  "Image resize and compression",
  "Resize Image to Exact KB",
  "Government form photo and signature tools",
  "JPG to PDF and PDF to JPG",
  "Merge, split, rotate, crop, and organize PDF tools",
];

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-950 px-5 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex rounded-3xl bg-white p-3">
            <LogoMark />
          </div>
          <p className="mt-4 max-w-md leading-7 text-slate-300"><BrandText /> - Smart PDF & Image Toolkit.</p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:text-[#FF2D2D]">
          Back to Homepage
          <ArrowRight className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
        </Link>
        <SocialLinks className="sm:justify-end" linkClassName="text-slate-400 hover:text-white" />
      </div>
    </footer>
  );
}

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              <BrandText /> Support
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              Contact Us
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Need help with a PDF or image tool? Send us a message and the <BrandText /> team will review your request.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <Mail className="h-7 w-7 text-[#FF2D2D]" aria-hidden="true" />
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Contact Information</h2>
                <p className="mt-3 leading-7 text-slate-600">For support, questions, feedback, or tool-related help, contact us by email.</p>
                <a href="mailto:support@pdfroot.com" className="mt-4 inline-flex rounded-full bg-red-50 px-4 py-2 text-sm font-black text-[#FF2D2D]">
                  support@pdfroot.com
                </a>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <MessageSquare className="h-7 w-7 text-[#FF2D2D]" aria-hidden="true" />
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Help Topics</h2>
                <div className="mt-5 grid gap-3">
                  {helpTopics.map((topic) => (
                    <div key={topic} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-[#FF2D2D]" aria-hidden="true" />
                      {topic}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <Timer className="h-7 w-7 text-[#FF2D2D]" aria-hidden="true" />
                <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Response Time</h2>
                <p className="mt-3 leading-7 text-slate-600">
                  We try to respond to support messages as soon as possible. Response time may vary depending on the number of requests.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
              <SectionHeading
                align="left"
                eyebrow="Send Message"
                title="How can we help?"
                description="Share your question, issue, or suggestion. Please include the tool name and file type if your message is about a specific PDFRoot tool."
              />
              <form className="mt-8 grid gap-4">
                <label className="text-sm font-black text-slate-800">
                  Name
                  <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" name="name" placeholder="Your name" />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Email
                  <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" name="email" placeholder="you@example.com" type="email" />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Subject
                  <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" name="subject" placeholder="What is this about?" />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Message
                  <textarea className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#FF2D2D] focus:ring-4 focus:ring-red-100" name="message" placeholder="Write your message here" />
                </label>
                <button type="submit" className="inline-flex items-center justify-center rounded-full bg-[#FF2D2D] px-7 py-4 text-base font-black text-white shadow-[0_18px_38px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  Submit
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">Support Note</h2>
              <p className="mt-3 leading-7 text-slate-600">
                <BrandText /> support can help with website usage, tool guidance, error reports, feedback, and general questions about PDF and image workflows.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">Important Note</h2>
              <p className="mt-3 leading-7 text-slate-600">
                Do not share passwords, OTPs, private account details, or sensitive personal information through the contact form. For official form requirements, always verify the latest instructions from the official website or notification.
              </p>
            </div>
          </div>
        </section>
        <WhyChoosePdfRoot />
      </main>
      <Footer />
    </>
  );
}
