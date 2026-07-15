import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoBulletGrid, InfoCard, InfoCta, InfoPageLayout } from "@/components/InfoPageLayout";

export const metadata: Metadata = {
  title: "About PDFRoot",
  description:
    "Learn about PDFRoot, a free online PDF and image toolkit for PDF conversion, image resizing, compression, government forms, office documents, and everyday file work.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About PDFRoot | Smart PDF & Image Toolkit",
    description:
      "PDFRoot helps students, government job applicants, cyber cafe users, office workers, and general users prepare PDF and image files quickly.",
    url: "https://www.pdfroot.com/about",
    images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "About PDFRoot | Smart PDF & Image Toolkit",
    description: "A free online PDF and image toolkit made for simple, fast, and practical document preparation.",
    images: ["https://www.pdfroot.com/branding/twitter-card.png"],
  },
};

const pdfTools = [
  "JPG to PDF",
  "PDF to JPG",
  "Merge PDF",
  "Split PDF",
  "Compress PDF",
  "Rotate PDF",
  "Protect PDF",
  "Unlock PDF",
  "Watermark PDF",
  "Delete PDF Pages",
  "Organize PDF Pages",
  "Crop PDF",
];

const imageTools = [
  "Resize Image to Exact KB",
  "Compress Image",
  "Crop Image",
  "Resize Image",
  "JPG to PNG",
  "PNG to JPG",
  "Front and Back Card Merge",
  "Passport Photo Maker",
  "Signature Resize Tool",
];

const users = [
  "Students",
  "Government job applicants",
  "Cyber cafe users",
  "Office workers",
  "Teachers",
  "Small business owners",
  "Form filling service providers",
  "General users",
  "Anyone who works with PDF and image files",
];

const focusItems = [
  "Easy to use",
  "Fast and practical",
  "Mobile friendly",
  "Useful for online forms",
  "Helpful for PDF and image editing",
  "Simple for non-technical users",
  "Clean and professional in design",
];

export default function AboutPage() {
  return (
    <InfoPageLayout
      eyebrow={<>About <BrandText styled /></>}
      title="Simple PDF and Image Tools for Everyone"
      subtitle={<><BrandText styled /> is a free online PDF and image toolkit created to make daily document work simple, fast, and easy without heavy software or complicated settings.</>}
    >
      <InfoCard title="Our Purpose">
        <p>
          Many online forms, government job applications, admission forms, office documents, and personal document tasks require files in a specific format, size, or dimension.
        </p>
        <p>
          Users often need to convert JPG to PDF, PDF to JPG, compress PDF, merge PDF files, resize images to exact KB, crop photos, resize signatures, or prepare documents for online upload. <BrandText styled /> brings these useful tools together in one clean and easy-to-use website.
        </p>
        <p>
          <BrandText styled /> is especially helpful for students, government job applicants, cyber cafe users, office users, business owners, and general users who regularly work with PDF and image files.
        </p>
        <p>
          Whether you are preparing documents for SSC, RRB, IBPS, OJAS, GPSC, UPSC, school admission, college admission, online verification, or another form submission, <BrandText styled /> helps you prepare your files quickly and correctly.
        </p>
      </InfoCard>

      <InfoCard title="What PDFRoot Offers">
        <p><BrandText styled /> focuses on practical tools for conversion, compression, resizing, cropping, organizing, protection, and online form preparation.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-foreground">PDF Tools</h3>
            <InfoBulletGrid items={pdfTools} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Image Tools</h3>
            <InfoBulletGrid items={imageTools} />
          </div>
        </div>
      </InfoCard>

      <InfoCard title={<>Why <BrandText styled /> is Useful</>}>
        <p>
          Many websites and online forms have strict upload requirements. A form may ask for a photo under 20KB, a signature in a fixed size, a PDF under a specific limit, or documents in JPG or PDF format.
        </p>
        <p>
          With <BrandText styled />, users do not need professional editing software. They can resize, convert, compress, crop, and prepare files directly from the browser.
        </p>
      </InfoCard>

      <InfoCard title="Our Mission">
        <p>
          Our mission is to provide a simple, reliable, and user-friendly platform for PDF and image tools. We want to make document preparation easier for everyone, especially users who apply for government jobs, fill online forms, manage office documents, or need quick file conversion tools.
        </p>
        <p>
          <BrandText styled /> is focused on speed, simplicity, and practical use. Every tool is created to help users complete their work with fewer steps and less confusion.
        </p>
      </InfoCard>

      <InfoCard title="Who Can Use PDFRoot?">
        <p><BrandText styled /> is designed for people who need quick, clean, mobile-friendly PDF and image tools without technical complexity.</p>
        <InfoBulletGrid items={users} />
      </InfoCard>

      <InfoCard title="Our Focus">
        <p>We continue to improve <BrandText styled /> by adding useful features, improving tool performance, and making the website easier for users.</p>
        <InfoBulletGrid items={focusItems} />
      </InfoCard>

      <InfoCta>
        <h2 className="text-3xl font-bold text-primary-foreground">We created <BrandText /> with one clear purpose</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">To make PDF and image file work simple for everyone.</p>
        <Link href="/tools" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-background px-7 py-4 text-base font-medium text-foreground transition hover:-translate-y-0.5">
          Browse Tools
          <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
        </Link>
      </InfoCta>
    </InfoPageLayout>
  );
}
