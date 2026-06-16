import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";
import { BrandPhrase, BrandText, LogoMark, SectionHeading } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";
import { SocialLinks } from "@/components/SocialLinks";
import { ToolCard } from "@/components/ToolCard";
import { UploadBox } from "@/components/UploadBox";
import { ToolSearch } from "@/components/ToolSearch";
import { WhyChoosePdfRoot } from "@/components/WhyChoosePdfRoot";
import { imageTools, pdfTools, tools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "PDFRoot - All PDF & Image Tools in One Place",
  description:
    "Use PDFRoot to convert, compress, merge, split, edit, organize, and resize PDFs and images online. Built for Indian students, cyber cafes, offices, and government recruitment forms.",
  keywords: [
    "pdf tools",
    "image tools",
    "resize image to exact kb",
    "ssc photo resize",
    "rrb photo resize",
    "passport photo maker",
    "compress pdf",
    "jpg to pdf",
    "pdf to jpg",
  ],
  alternates: {
    canonical: "/",
  },
};

const governmentToolNames = [
  "Resize Image to Exact KB",
  "SSC Photo Resize",
  "RRB Photo Resize",
  "IBPS Photo Resize",
  "OJAS Photo Resize",
  "GPSC Photo Resize",
  "UPSC Photo Resize",
  "Front & Back Card Merge",
  "Passport Photo Maker",
  "Signature Resize Tool",
];

const pdfToolNames = [
  "Merge PDF",
  "Split PDF",
  "Compress PDF",
  "PDF to Word",
  "PDF to Excel",
  "PDF to PowerPoint",
  "Word to PDF",
  "Excel to PDF",
  "PowerPoint to PDF",
  "PDF to JPG",
  "JPG to PDF",
  "Rotate PDF",
  "Protect PDF",
  "Unlock PDF",
  "Watermark PDF",
  "Delete PDF Pages",
  "Organize PDF Pages",
  "Crop PDF",
];

const imageToolNames = [
  "Resize Image to Exact KB",
  "Compress Image",
  "JPG to PNG",
  "PNG to JPG",
  "Crop Image",
  "Resize Image",
  "Passport Photo Maker",
  "Signature Resize Tool",
  "Front & Back Card Merge",
];

const features = [
  { title: "Fast Processing", description: "Quick workflows for cafe counters, students, and office documents.", icon: Zap },
  { title: "Secure Files", description: "Trust-focused upload experience for personal documents and forms.", icon: ShieldCheck },
  { title: "No Installation", description: "Use PDF and image tools directly in the browser on any device.", icon: UploadCloud },
  { title: "Mobile Friendly", description: "Clean responsive layouts for phones, tablets, and desktops.", icon: Smartphone },
  { title: "Government Form Ready", description: "Exact KB photo and signature tools for recruitment portals.", icon: FileCheck2 },
  { title: "Free Daily Usage", description: "Simple online utility access for everyday file tasks.", icon: BadgeCheck },
];

const faqs = [
  {
    question: "Can I convert PDF files online with PDFRoot?",
    answer:
      "Yes. PDFRoot includes PDF conversion tools such as PDF to Word, PDF to Excel, PDF to PowerPoint, Word to PDF, JPG to PDF, and PDF to JPG.",
  },
  {
    question: "How do I resize an image to exact KB?",
    answer:
      "Open Resize Image to Exact KB, upload your photo or signature, enter the target size such as 20KB, 50KB, or 100KB, and download the optimized file.",
  },
  {
    question: "Can I resize SSC photo and signature online?",
    answer:
      "Yes. PDFRoot provides SSC Photo Resize and signature resize tools for candidates who need form-ready images with strict size limits.",
  },
  {
    question: "Can I resize photos for RRB railway forms?",
    answer:
      "Yes. The RRB Photo Resize tool helps prepare photo and signature files for railway recruitment applications.",
  },
  {
    question: "Does PDFRoot include a passport photo maker?",
    answer:
      "Yes. Passport Photo Maker helps prepare official-style photos for forms, admissions, applications, and document uploads.",
  },
  {
    question: "How do I compress a PDF online?",
    answer:
      "Choose Compress PDF, upload your document, let PDFRoot reduce the file size, and download the compressed PDF for email or portal upload.",
  },
];

const selectedTools = (names: string[]) =>
  names
    .map((name) => tools.find((tool) => tool.name === name))
    .filter((tool): tool is (typeof tools)[number] => Boolean(tool));

const governmentTools = selectedTools(governmentToolNames);
const homepagePdfTools = selectedTools(pdfToolNames);
const homepageImageTools = selectedTools(imageToolNames);

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

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PDFRoot",
  alternateName: "PDFRoot Smart PDF & Image Toolkit",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  url: "https://pdfroot.com",
  description:
    "PDFRoot is a smart PDF and image toolkit for conversion, compression, exact KB image resizing, government form photos, and everyday document work.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://pdfroot.com",
    },
  ],
};

function ToolGrid({ items, compact = false }: { items: typeof tools; compact?: boolean }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {items.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} compact={compact} />
      ))}
    </div>
  );
}

function Footer() {
  const columns = [
    { title: "PDF Tools", links: pdfTools.slice(0, 6) },
    { title: "Image Tools", links: imageTools.slice(0, 6) },
    { title: "Government Tools", links: governmentTools.slice(0, 6) },
  ];

  return (
    <footer className="border-t border-slate-200 bg-slate-950 px-5 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_1.6fr]">
        <div>
          <div className="inline-flex rounded-3xl bg-white p-3">
            <LogoMark />
          </div>
          <p className="mt-5 max-w-md leading-7 text-slate-300">
            <BrandText /> - Smart PDF & Image Toolkit for Indian students, cyber cafes, government job applicants, and office work.
          </p>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3 text-sm font-bold text-slate-300">
              {[
                ["About", "/about"],
                ["FAQ", "/faq"],
                ["Blog", "/blog"],
                ["Privacy Policy", "/privacy-policy"],
                ["Terms", "/terms-and-conditions"],
                ["Disclaimer", "/disclaimer"],
                ["Contact", "/contact"],
              ].map(([label, href]) => (
                <Link key={label} href={href} className="hover:text-white">
                  {label}
                </Link>
              ))}
            </div>
            <SocialLinks className="shrink-0 sm:justify-end" linkClassName="text-slate-400 hover:text-white" />
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">{column.title}</h3>
              <div className="mt-4 grid gap-2">
                {column.links.map((tool) => (
                  <Link key={tool.slug} href={`/${tool.slug}`} className="text-sm font-semibold text-slate-400 hover:text-white">
                    {tool.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-sm text-slate-400">
        © 2026 <BrandText />. All rights reserved.
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white via-red-50/35 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <BrandText /> - Smart PDF & Image Toolkit
              </div>
              <h1 className="mx-auto mt-6 max-w-4xl text-balance font-black tracking-tight text-slate-950 lg:mx-0">
                All PDF & Image Tools in One Place
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl lg:mx-0">
                Convert, compress, merge, split, edit, organize, and resize PDFs and images in seconds.
              </p>
              <ToolSearch />
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <a href="#government-tools" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF2D2D] px-7 py-4 text-base font-black text-white shadow-[0_18px_38px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600">
                  Choose a Tool
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
                <Link href="/resize-image-to-exact-kb" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-base font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:text-[#FF2D2D]">
                  Resize Image to Exact KB
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
                {["Secure Files", "Fast Processing", "No Registration", "Mobile Friendly"].map((badge) => (
                  <span key={badge} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
                    <CheckCircle2 className="h-4 w-4 text-[#FF2D2D]" aria-hidden="true" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <UploadBox title="Drag & Drop Upload" description="Upload PDFs, images, photos, signatures, Word, Excel, or PowerPoint files and choose the right tool instantly." />
          </div>
        </section>

        <section id="government-tools" className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Government Form Tools"
              title="Photo and signature tools for Indian application forms"
              description="Featured tools for SSC, RRB, IBPS, OJAS, GPSC, UPSC, passport photos, signatures, scholarships, and recruitment uploads."
            />
            <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-[#FF2D2D] ring-1 ring-red-100">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              Premium government form special
            </div>
            <ToolGrid items={governmentTools} />
          </div>
        </section>

        <section id="pdf-tools" className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="PDF Tools"
              title="Convert, compress, organize, and protect PDFs"
              description="Clean PDF tools for office work, college submissions, cyber cafe tasks, and everyday document preparation."
            />
            <ToolGrid items={homepagePdfTools} />
          </div>
        </section>

        <section id="image-tools" className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Image Tools"
              title="Resize, compress, crop, and convert images"
              description="Prepare photos, signatures, scanned images, and form uploads with simple image utilities."
            />
            <ToolGrid items={homepageImageTools} />
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Why Choose PDFRoot"
              title="Built for speed, trust, and real Indian workflows"
              description="PDFRoot keeps PDF and image tasks easy for students, government applicants, offices, and cyber cafe customers."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ title, description, icon: Icon }) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <SectionHeading
              align="left"
              eyebrow="SEO Guide"
              title="PDF and image tools for students, forms, and office work"
              description="PDFRoot helps users quickly complete common online tasks: PDF conversion, PDF compression, image resizing, exact KB photo resize, signature resize, passport photo preparation, and recruitment form uploads."
            />
            <div className="rounded-3xl border border-slate-200 bg-white p-7 leading-8 text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p>
                Indian government recruitment forms often require strict photo and signature sizes. <BrandText /> focuses on exact KB image resize tools for SSC, RRB, IBPS, OJAS, GPSC, UPSC, railway, banking, scholarship, passport, and admission workflows.
              </p>
              <p className="mt-4">
                The platform also includes PDF tools such as Merge PDF, Split PDF, Compress PDF, PDF to Word, Word to PDF, JPG to PDF, PDF to JPG, Protect PDF, Unlock PDF, and Organize PDF for everyday document work.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="FAQ"
              title="Common PDFRoot questions"
              description="Answers for PDF conversion, exact KB image resize, government forms, passport photos, and PDF compression."
            />
            <div className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              {faqs.map((faq) => (
                <details key={faq.question} className="group p-6 open:bg-red-50/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-black text-slate-950">
                    <BrandPhrase text={faq.question} />
                    <ArrowRight className="h-5 w-5 text-[#FF2D2D] transition group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <p className="mt-4 leading-7 text-slate-600">
                    <BrandPhrase text={faq.answer} />
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-5 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-3xl bg-[#FF2D2D] p-8 text-white shadow-[0_24px_70px_rgba(255,45,45,0.22)] sm:p-10">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-red-100">Start free</p>
            <h2 className="mt-3 text-3xl font-black text-white sm:text-4xl">Choose your PDF or image tool</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-red-50">
              Fast PDF and image utilities for real business, study, and government form work.
            </p>
            <a href="#government-tools" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-black text-slate-950 transition hover:-translate-y-0.5">
              Browse Tools
              <ArrowRight className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
            </a>
          </div>
        </section>

        <section id="blog" className="sr-only" aria-label="PDFRoot blog links" />
        <WhyChoosePdfRoot />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareSchema, faqSchema, breadcrumbSchema]),
        }}
      />
    </>
  );
}
