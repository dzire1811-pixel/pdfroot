import type { Metadata } from "next";
import { BlogSection } from "@/components/homepage/blog-section";
import { Faq } from "@/components/homepage/faq";
import { GovFormTools } from "@/components/homepage/gov-form-tools";
import { Hero } from "@/components/homepage/hero";
import { PopularTools } from "@/components/homepage/popular-tools";
import { ProductShowcase } from "@/components/homepage/product-showcase";
import { HomepageSiteFooter } from "@/components/homepage/site-footer";
import { HomepageSiteHeader } from "@/components/homepage/site-header";
import { Stats } from "@/components/homepage/stats";
import { WhyChoose } from "@/components/homepage/why-choose";
import { imageTools, pdfTools, tools, type Tool } from "@/lib/tools";

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
    .filter((tool): tool is Tool => Boolean(tool));

const governmentTools = selectedTools(governmentToolNames);
const popularTools = tools.filter((tool) => tool.popular || tool.featured).slice(0, 8);

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

export default function Home() {
  return (
    <div className="v0-homepage min-h-screen bg-background">
      <HomepageSiteHeader />
      <main>
        <Hero />
        <PopularTools tools={popularTools} />
        <GovFormTools tools={governmentTools} />
        <ProductShowcase />
        <BlogSection />
        <WhyChoose />
        <Stats />
        <Faq items={faqs} />
      </main>
      <HomepageSiteFooter pdfTools={pdfTools} imageTools={imageTools} governmentTools={governmentTools} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareSchema, faqSchema, breadcrumbSchema]),
        }}
      />
    </div>
  );
}
