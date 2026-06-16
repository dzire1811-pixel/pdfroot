import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the PDFRoot Privacy Policy to understand how PDFRoot handles website usage information, contact form details, uploaded files, cookies, analytics, advertising, and security.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy | PDFRoot",
    description: "Learn how PDFRoot protects privacy while providing online PDF and image tools.",
    url: "https://pdfroot.com/privacy-policy",
    images: ["/pdfroot-og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | PDFRoot",
    description: "Learn how PDFRoot handles privacy, files, cookies, analytics, and contact information.",
    images: ["/pdfroot-og-image.png"],
  },
};

const collectedInfo = [
  "Basic usage information",
  "Browser type and device information",
  "Pages visited on our website",
  "Tool usage information",
  "Error or performance data",
  "Contact form information if you submit it",
];

const uses = [
  "Provide PDF and image tools",
  "Improve website performance",
  "Fix errors and bugs",
  "Improve user experience",
  "Respond to user messages",
  "Understand which tools are useful",
  "Keep the website safe and reliable",
];

const sensitiveItems = [
  "Passwords",
  "Bank details",
  "Aadhaar number",
  "PAN number",
  "Private certificates",
  "Confidential documents",
  "Personal identification documents unless required for your own work",
];

function PolicyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-8">
      <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      <div className="mt-4 space-y-4 text-base leading-8 text-slate-600">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#FF2D2D]" aria-hidden="true" />
          {item}
        </div>
      ))}
    </div>
  );
}

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Last updated: June 15, 2026
            </p>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <PolicyCard title="Welcome to PDFRoot">
              <p>
                Your privacy is important to us. This Privacy Policy explains how PDFRoot collects, uses, protects, and handles information when you use our website and tools.
              </p>
              <p>
                PDFRoot provides online PDF and image tools such as JPG to PDF, PDF to JPG, Compress PDF, Merge PDF, Resize Image to Exact KB, Photo and Signature Resize, Crop Image, Compress Image, and other related tools.
              </p>
              <p>By using PDFRoot, you agree to the terms of this Privacy Policy.</p>
            </PolicyCard>

            <PolicyCard title="Information We Collect">
              <p>PDFRoot may collect limited information to improve website performance, user experience, and tool functionality.</p>
              <p>We may collect:</p>
              <BulletList items={collectedInfo} />
              <p>If you contact us through a contact form or email, we may collect your name, email address, subject, and message.</p>
            </PolicyCard>

            <PolicyCard title="Files Uploaded to PDFRoot">
              <p>
                PDFRoot tools are created to process PDF and image files for user convenience. Uploaded files may be used only for the purpose of completing the selected tool action, such as converting, compressing, resizing, cropping, merging, or editing files.
              </p>
              <p>
                We do not ask users to upload unnecessary personal documents. Users should avoid uploading highly sensitive personal information unless required for their own task.
              </p>
              <p>
                If file processing is handled directly in the browser, your files may not be uploaded to our server. If any tool requires server-side processing, files should be used only for processing and should not be stored permanently.
              </p>
            </PolicyCard>

            <PolicyCard title="How We Use Information">
              <p>We may use collected information to:</p>
              <BulletList items={uses} />
              <p>We do not sell users&apos; personal information.</p>
            </PolicyCard>

            <PolicyCard title="Cookies">
              <p>
                PDFRoot may use cookies or similar technologies to improve website experience, remember basic preferences, analyze traffic, and improve services.
              </p>
              <p>
                You can disable cookies from your browser settings. However, some website features may not work properly if cookies are disabled.
              </p>
            </PolicyCard>

            <PolicyCard title="Analytics and Third-Party Services">
              <p>
                PDFRoot may use third-party services such as analytics tools, advertising networks, or hosting services to understand website usage, improve performance, and support website operations.
              </p>
              <p>These third-party services may collect information according to their own privacy policies.</p>
            </PolicyCard>

            <PolicyCard title="Advertising">
              <p>
                PDFRoot may display advertisements in the future. Advertising partners may use cookies or similar technologies to show relevant ads and measure ad performance.
              </p>
              <p>
                PDFRoot does not control how third-party advertisers collect or use data. Users should review the privacy policies of those advertising partners for more information.
              </p>
            </PolicyCard>

            <PolicyCard title="Data Security">
              <p>
                We try to use reasonable security measures to protect user information and uploaded files. However, no online platform can guarantee 100% security.
              </p>
              <p>Users are responsible for ensuring that they do not upload files containing unnecessary sensitive information.</p>
            </PolicyCard>

            <PolicyCard title="User Responsibility">
              <p>Users should avoid uploading sensitive information such as:</p>
              <BulletList items={sensitiveItems} />
              <p>
                PDFRoot is a file processing tool platform, and users are responsible for the files they choose to upload and process.
              </p>
            </PolicyCard>

            <PolicyCard title="Children's Privacy">
              <p>
                PDFRoot is intended for general users. We do not knowingly collect personal information from children. If you believe that a child has provided personal information, please contact us so we can take appropriate action.
              </p>
            </PolicyCard>

            <PolicyCard title="External Links">
              <p>
                PDFRoot may contain links to third-party websites. We are not responsible for the privacy practices, content, or policies of external websites.
              </p>
            </PolicyCard>

            <PolicyCard title="Changes to This Privacy Policy">
              <p>
                PDFRoot may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated date.
              </p>
              <p>Users are encouraged to review this page regularly to stay informed about how we protect privacy.</p>
            </PolicyCard>

            <PolicyCard title="Contact Us">
              <p>If you have any questions about this Privacy Policy, you can contact us:</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-700">
                <p>Website: PDFRoot.com</p>
                <p className="mt-2">
                  Email:{" "}
                  <a href="mailto:support@pdfroot.com" className="text-[#FF2D2D] hover:text-red-600">
                    support@pdfroot.com
                  </a>
                </p>
              </div>
              <p>By using PDFRoot, you agree to this Privacy Policy.</p>
            </PolicyCard>

            <div className="rounded-3xl bg-[#FF2D2D] p-8 text-center text-white shadow-[0_24px_70px_rgba(255,45,45,0.22)] sm:p-10">
              <h2 className="text-3xl font-black text-white">Need help with privacy?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-red-50">
                Contact PDFRoot support for questions about this Privacy Policy or our website tools.
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
