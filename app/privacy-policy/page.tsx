import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandText } from "@/components/Brand";
import { InfoBulletGrid, InfoCard, InfoCta, InfoPageLayout } from "@/components/InfoPageLayout";

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
    url: "https://www.pdfroot.com/privacy-policy",
    images: ["https://www.pdfroot.com/branding/open-graph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | PDFRoot",
    description: "Learn how PDFRoot handles privacy, files, cookies, analytics, and contact information.",
    images: ["https://www.pdfroot.com/branding/twitter-card.png"],
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

export default function PrivacyPolicyPage() {
  return (
    <InfoPageLayout eyebrow={<><BrandText styled /> Legal</>} title="Privacy Policy" subtitle="Last updated: July 15, 2026">
      <InfoCard title="Welcome to PDFRoot">
        <p>Your privacy is important to us. This Privacy Policy explains how <BrandText styled /> collects, uses, protects, and handles information when you use our website and tools.</p>
        <p><BrandText styled /> provides online PDF and image tools such as JPG to PDF, PDF to JPG, Compress PDF, Merge PDF, Resize Image to Exact KB, Photo and Signature Resize, Crop Image, Compress Image, and other related tools.</p>
        <p>By using <BrandText styled />, you agree to the terms of this Privacy Policy.</p>
      </InfoCard>

      <InfoCard title="Information We Collect">
        <p><BrandText styled /> may collect limited information to improve website performance, user experience, and tool functionality.</p>
        <p>We may collect:</p>
        <InfoBulletGrid items={collectedInfo} />
        <p>If you contact us through a contact form or email, we may collect your name, email address, subject, and message.</p>
      </InfoCard>

      <InfoCard title="Files Uploaded to PDFRoot">
        <p><BrandText styled /> tools are created to process PDF and image files for user convenience. Uploaded files may be used only for the purpose of completing the selected tool action, such as converting, compressing, resizing, cropping, merging, or editing files.</p>
        <p>We do not ask users to upload unnecessary personal documents. Users should avoid uploading highly sensitive personal information unless required for their own task.</p>
        <p>If file processing is handled directly in the browser, your files may not be uploaded to our server. If any tool requires server-side processing, files should be used only for processing and should not be stored permanently.</p>
      </InfoCard>

      <InfoCard title="How We Use Information">
        <p>We may use collected information to:</p>
        <InfoBulletGrid items={uses} />
        <p>We do not sell users&apos; personal information.</p>
      </InfoCard>

      <InfoCard title="Cookies">
        <p><BrandText styled /> may use cookies or similar technologies to improve website experience, remember basic preferences, analyze traffic, and improve services.</p>
        <p>You can disable cookies from your browser settings. However, some website features may not work properly if cookies are disabled.</p>
      </InfoCard>

      <InfoCard title="Google Analytics">
        <p><BrandText styled /> uses Google Analytics 4 after you provide consent to understand page visits, tool-page usage, browser and device information, approximate location, and website performance.</p>
        <p>Google Analytics may use cookies or similar technologies after consent. Uploaded PDF or image file contents are not sent to Google Analytics. <BrandText styled /> does not intentionally send names, email addresses, uploaded filenames, or document contents to Google Analytics.</p>
        <p>You can accept or reject analytics when the cookie banner appears and can later change your choice through Cookie preferences in the website footer.</p>
        <p>
          Learn more about how Google uses information from sites that use its services in{" "}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/80">
            Google&apos;s partner-sites information
          </a>{" "}
          and review the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/80">
            Google Privacy Policy
          </a>
          .
        </p>
        <div className="border-t border-border pt-5">
          <h3 className="text-lg font-semibold text-foreground">Microsoft Clarity</h3>
          <p className="mt-3"><BrandText styled /> uses Microsoft Clarity after analytics consent to understand website interactions through anonymous or aggregated heatmaps and session recordings.</p>
          <p>Uploaded PDF or image contents, previews, filenames, signatures, photos, and generated files are masked and must not be intentionally sent to Clarity. Visitors can reject analytics or later change their choice through Cookie preferences in the website footer.</p>
          <p>
            Review the{" "}
            <a href="https://privacy.microsoft.com/en-us/privacystatement" target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/80">
              Microsoft Privacy Statement
            </a>{" "}
            and{" "}
            <a href="https://clarity.microsoft.com/privacy?clang=en" target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary/80">
              Microsoft Clarity privacy information
            </a>
            .
          </p>
        </div>
      </InfoCard>

      <InfoCard title="Advertising">
        <p><BrandText styled /> may display advertisements in the future. Advertising partners may use cookies or similar technologies to show relevant ads and measure ad performance.</p>
        <p><BrandText styled /> does not control how third-party advertisers collect or use data. Users should review the privacy policies of those advertising partners for more information.</p>
      </InfoCard>

      <InfoCard title="Data Security">
        <p>We try to use reasonable security measures to protect user information and uploaded files. However, no online platform can guarantee 100% security.</p>
        <p>Users are responsible for ensuring that they do not upload files containing unnecessary sensitive information.</p>
      </InfoCard>

      <InfoCard title="User Responsibility">
        <p>Users should avoid uploading sensitive information such as:</p>
        <InfoBulletGrid items={sensitiveItems} />
        <p><BrandText styled /> is a file processing tool platform, and users are responsible for the files they choose to upload and process.</p>
      </InfoCard>

      <InfoCard title="Children's Privacy">
        <p><BrandText styled /> is intended for general users. We do not knowingly collect personal information from children. If you believe that a child has provided personal information, please contact us so we can take appropriate action.</p>
      </InfoCard>

      <InfoCard title="External Links">
        <p><BrandText styled /> may contain links to third-party websites. We are not responsible for the privacy practices, content, or policies of external websites.</p>
      </InfoCard>

      <InfoCard title="Changes to This Privacy Policy">
        <p><BrandText styled /> may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated date.</p>
        <p>Users are encouraged to review this page regularly to stay informed about how we protect privacy.</p>
      </InfoCard>

      <InfoCard title="Contact Us">
        <p>If you have any questions about this Privacy Policy, you can contact us:</p>
        <div className="rounded-xl border border-border bg-muted/40 p-5 text-sm font-medium text-foreground">
          <p>Website: <BrandText styled />.com</p>
          <p className="mt-2">
            Email:{" "}
            <a href="mailto:support@pdfroot.com" className="text-primary hover:text-primary/80">
              support@pdfroot.com
            </a>
          </p>
        </div>
        <p>By using <BrandText styled />, you agree to this Privacy Policy.</p>
      </InfoCard>

      <InfoCta>
        <h2 className="text-3xl font-bold text-primary-foreground">Need help with privacy?</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
          Contact <BrandText /> support for questions about this Privacy Policy or our website tools.
        </p>
        <Link href="/contact" className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-background px-7 py-4 text-base font-medium text-foreground transition hover:-translate-y-0.5">
          Contact Support
          <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
        </Link>
      </InfoCta>
    </InfoPageLayout>
  );
}
