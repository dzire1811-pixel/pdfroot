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
import { filterVisibleTools, isToolVisibleInListings } from "@/lib/toolVisibility";
import { imageTools, pdfTools, tools, type Tool } from "@/lib/tools";

export const metadata: Metadata = {
  title: "PDFRoot - All PDF & Image Tools in One Place",
  description:
    "Use PDFRoot to convert, compress, merge, split, edit, organize, and resize PDFs and images online. Built for Indian students, cyber cafes, offices, and government recruitment forms.",
  keywords: [
    "pdf tools",
    "image tools",
    "resize image to exact kb",
    "ssc signature resize",
  "rrb signature resize",
    "passport photo maker",
    "compress pdf",
    "jpg to pdf",
    "pdf to jpg",
  ],
};

const governmentToolNames = [
  "Resize Image to Exact KB",
  "SSC Signature Resize Tool",
  "RRB Signature Resize",
  "IBPS Photo, Signature, Thumb & Declaration Resize",
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
    question: "Can I resize SSC signatures online?",
    answer:
      "Yes. PDFRoot provides an SSC Signature Resize Tool for candidates who need JPG/JPEG signatures sized between 10KB and 20KB.",
  },
  {
    question: "Can I resize signatures for RRB railway forms?",
    answer:
      "Yes. The RRB Signature Resize tool helps prepare JPG/JPEG signatures for railway recruitment applications.",
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

const visibleFaqs = faqs.filter((item) => item.question !== "Does PDFRoot include a passport photo maker?");

const selectedTools = (names: string[]) =>
  names
    .map((name) => tools.find((tool) => tool.name === name))
    .filter((tool): tool is Tool => tool !== undefined && isToolVisibleInListings(tool));

const governmentTools = selectedTools(governmentToolNames);
const visiblePdfTools = filterVisibleTools(pdfTools);
const visibleImageTools = filterVisibleTools(imageTools);
const popularTools = filterVisibleTools(tools).filter((tool) => tool.popular || tool.featured).slice(0, 8);

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
  url: "https://www.pdfroot.com",
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
      item: "https://www.pdfroot.com",
    },
  ],
};

export default function Home() {
  return (
    <div className="v0-homepage min-h-screen bg-background">
      <link rel="canonical" href="https://www.pdfroot.com/" />
      <HomepageSiteHeader />
      <main>
        <Hero />
        <PopularTools tools={popularTools} />
        <GovFormTools tools={governmentTools} />
        <ProductShowcase />
        <BlogSection />
        <WhyChoose />
        <Stats />
        <Faq items={visibleFaqs} />
      </main>
      <HomepageSiteFooter pdfTools={visiblePdfTools} imageTools={visibleImageTools} governmentTools={governmentTools} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareSchema, faqSchema, breadcrumbSchema]),
        }}
      />
    </div>
  );
}
