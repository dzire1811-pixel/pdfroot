import type { Metadata } from "next";
import { Mail, MessageSquare, ShieldCheck, Timer } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoBulletGrid, InfoCard, InfoPageLayout } from "@/components/InfoPageLayout";

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

export default function ContactPage() {
  return (
    <InfoPageLayout
      eyebrow={<><BrandText styled /> Support</>}
      title="Contact Us"
      subtitle={<>Need help with a PDF or image tool? Send us a message and the <BrandText styled /> team will review your request.</>}
    >
      <InfoCard title="Contact Information">
        <Mail className="h-7 w-7 text-primary" aria-hidden="true" />
        <p>For support, questions, feedback, or tool-related help, contact us by email.</p>
        <a href="mailto:support@pdfroot.com" className="inline-flex rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          support@pdfroot.com
        </a>
      </InfoCard>

      <InfoCard title="How can we help?">
        <p>Share your question, issue, or suggestion. Please include the tool name and file type if your message is about a specific <BrandText styled /> tool.</p>
        <form action="mailto:support@pdfroot.com" method="post" encType="text/plain" className="mt-6 grid gap-4">
          <label className="text-sm font-semibold text-foreground">
            Name
            <input className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="name" placeholder="Your name" />
          </label>
          <label className="text-sm font-semibold text-foreground">
            Email
            <input className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="email" placeholder="you@example.com" type="email" />
          </label>
          <label className="text-sm font-semibold text-foreground">
            Subject
            <input className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="subject" placeholder="What is this about?" />
          </label>
          <label className="text-sm font-semibold text-foreground">
            Message
            <textarea className="mt-2 min-h-36 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" name="message" placeholder="Write your message here" />
          </label>
          <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-primary px-7 py-4 text-base font-medium text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90">
            Email Support
          </button>
        </form>
      </InfoCard>

      <InfoCard title="Help Topics">
        <MessageSquare className="h-7 w-7 text-primary" aria-hidden="true" />
        <InfoBulletGrid items={helpTopics} />
      </InfoCard>

      <InfoCard title="Response Time">
        <Timer className="h-7 w-7 text-primary" aria-hidden="true" />
        <p>We try to respond to support messages as soon as possible. Response time may vary depending on the number of requests.</p>
      </InfoCard>

      <div className="grid gap-6 md:grid-cols-2">
        <InfoCard title="Support Note">
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          <p><BrandText styled /> support can help with website usage, tool guidance, error reports, feedback, and general questions about PDF and image workflows.</p>
        </InfoCard>
        <InfoCard title="Important Note">
          <p>Do not share passwords, OTPs, private account details, or sensitive personal information through the contact form. For official form requirements, always verify the latest instructions from the official website or notification.</p>
        </InfoCard>
      </div>
    </InfoPageLayout>
  );
}
