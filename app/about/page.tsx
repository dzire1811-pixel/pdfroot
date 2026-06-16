import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/Brand";
import { SiteHeader } from "@/components/SiteHeader";

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
    url: "https://pdfroot.com/about",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "About PDFRoot | Smart PDF & Image Toolkit",
    description: "A free online PDF and image toolkit made for simple, fast, and practical document preparation.",
    images: ["/pdfroot-og-image.png"],
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

function BulletGrid({ items }: { items: string[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#FF2D2D]" aria-hidden="true" />
          {item}
        </div>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-white text-slate-950">
        <section className="border-b border-slate-200 bg-gradient-to-b from-white via-red-50/30 to-white px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-black text-[#FF2D2D] shadow-sm">
              About PDFRoot
            </p>
            <h1 className="mx-auto mt-5 max-w-3xl text-balance font-black tracking-tight text-slate-950">
              Simple PDF and Image Tools for Everyone
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              PDFRoot is a free online PDF and image toolkit created to make daily document work simple, fast, and easy without heavy software or complicated settings.
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHeading
              align="left"
              eyebrow="Our Purpose"
              title="Built for real document work"
              description="Many online forms, government job applications, admission forms, office documents, and personal document tasks require files in a specific format, size, or dimension."
            />
            <div className="rounded-3xl border border-slate-200 bg-white p-7 text-base leading-8 text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p>
                Users often need to convert JPG to PDF, PDF to JPG, compress PDF, merge PDF files, resize images to exact KB, crop photos, resize signatures, or prepare documents for online upload. PDFRoot brings these useful tools together in one clean and easy-to-use website.
              </p>
              <p className="mt-4">
                PDFRoot is especially helpful for students, government job applicants, cyber cafe users, office users, business owners, and general users who regularly work with PDF and image files.
              </p>
              <p className="mt-4">
                Whether you are preparing documents for SSC, RRB, IBPS, OJAS, GPSC, UPSC, school admission, college admission, online verification, or another form submission, PDFRoot helps you prepare your files quickly and correctly.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="What PDFRoot Offers"
              title="Multiple PDF and image tools in one place"
              description="PDFRoot focuses on practical tools for conversion, compression, resizing, cropping, organizing, protection, and online form preparation."
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <h2 className="text-2xl font-black tracking-tight text-slate-950">PDF Tools</h2>
                <BulletGrid items={pdfTools} />
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Image Tools</h2>
                <BulletGrid items={imageTools} />
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Why PDFRoot is Useful</h2>
              <p className="mt-5 leading-8 text-slate-600">
                Many websites and online forms have strict upload requirements. A form may ask for a photo under 20KB, a signature in a fixed size, a PDF under a specific limit, or documents in JPG or PDF format.
              </p>
              <p className="mt-4 leading-8 text-slate-600">
                With PDFRoot, users do not need professional editing software. They can resize, convert, compress, crop, and prepare files directly from the browser.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <h2 className="text-3xl font-black tracking-tight text-slate-950">Our Mission</h2>
              <p className="mt-5 leading-8 text-slate-600">
                Our mission is to provide a simple, reliable, and user-friendly platform for PDF and image tools. We want to make document preparation easier for everyone, especially users who apply for government jobs, fill online forms, manage office documents, or need quick file conversion tools.
              </p>
              <p className="mt-4 leading-8 text-slate-600">
                PDFRoot is focused on speed, simplicity, and practical use. Every tool is created to help users complete their work with fewer steps and less confusion.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Who Can Use PDFRoot?"
              title="Made for everyday users"
              description="PDFRoot is designed for people who need quick, clean, mobile-friendly PDF and image tools without technical complexity."
            />
            <BulletGrid items={users} />
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Our Focus"
              title="Simple tools that solve common file problems"
              description="We continue to improve PDFRoot by adding useful features, improving tool performance, and making the website easier for users."
            />
            <BulletGrid items={focusItems} />
            <div className="mt-10 rounded-3xl bg-[#FF2D2D] p-8 text-center text-white shadow-[0_24px_70px_rgba(255,45,45,0.22)] sm:p-10">
              <h2 className="text-3xl font-black text-white">PDFRoot is created with one clear purpose</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-red-50">
                To make PDF and image file work simple for everyone.
              </p>
              <Link href="/tools" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-base font-black text-slate-950 transition hover:-translate-y-0.5">
                Browse Tools
                <ArrowRight className="h-5 w-5 text-[#FF2D2D]" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
