import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Info, XCircle } from "lucide-react";
import { resizeImageExactKbFaq } from "@/lib/blog";

const exactKbToolUrl = "https://pdfroot.com/resize-image-to-exact-kb";

const requiredPlaces = [
  "Passport-size photographs",
  "Signatures",
  "Identity documents",
  "Certificates and marksheets",
  "Government recruitment forms",
  "Competitive examination forms",
  "College and university admission forms",
  "Scholarship applications",
  "Private-sector job application forms",
];

const benefits = [
  "No advanced photo-editing knowledge is required.",
  "Users can enter the required KB size themselves.",
  "The tool works on mobile phones and desktop computers.",
  "It can save time while filling out online forms.",
  "Users do not need complicated image-editing software.",
  "It can help people prepare images without travelling only for image resizing.",
  "Files Processed Locally",
];

const tips = [
  "Confirm that the photograph or document is clear and readable.",
  "Make sure the image format matches the form requirements.",
  "Check the required width and height if dimensions are mentioned.",
  "Do not upload a blurred or stretched image.",
  "Keep a copy of the original image.",
  "Preview the processed image before submitting the form.",
  "Confirm that the face, signature, or document details are not cropped.",
  "Check both the file size in KB and image dimensions in pixels.",
];

const mistakes = [
  "Confusing KB with MB",
  "Uploading the wrong file format",
  "Ignoring the required width and height",
  "Compressing the image until it becomes unclear",
  "Uploading a photograph with an incorrect background",
  "Uploading an old or unrelated photograph",
  "Cropping part of the face, signature, or document",
  "Submitting the form without checking the uploaded image preview",
];

function ArticleCta() {
  return (
    <a href={exactKbToolUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
      Resize Your Image to Exact KB Now
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function BlogBrandName() {
  return (
    <span className="whitespace-nowrap text-current normal-case" aria-label="PDFRoot">
      <span className="text-[#B91C1C]">PDF</span><span className="text-foreground">Root</span>
    </span>
  );
}

function BlogBrandPhrase({ text }: { text: string }) {
  const parts = text.split("PDFRoot");
  return <>{parts.map((part, index) => <span key={`${part}-${index}`}>{part}{index < parts.length - 1 ? <BlogBrandName /> : null}</span>)}</>;
}

function ArticleSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function BodyParagraph({ children }: { children: ReactNode }) {
  return <p className="text-left sm:text-justify sm:[text-justify:inter-word]">{children}</p>;
}

export function ResizeImageExactKbArticle() {
  return (
    <article className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm">
      <Image
        src="/blog/resize-image-to-exact-kb-online-pdfroot.webp"
        alt="PDFRoot Resize Image to Exact KB tool for online application forms"
        width={1200}
        height={630}
        priority
        className="h-auto w-full border-b border-border object-cover"
        sizes="(max-width: 768px) 100vw, 768px"
      />

      <div className="p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Written by Anand Joshi, Founder of <BlogBrandName />.</span>
          <span aria-hidden="true">•</span>
          <span>Published <time dateTime="2026-07-19">19 July 2026</time></span>
          <span aria-hidden="true">•</span>
          <span>Last updated <time dateTime="2026-07-19">19 July 2026</time></span>
        </div>

        <div className="mt-8 space-y-5 text-[1.03rem] leading-8 text-muted-foreground">
          <p className="font-semibold text-foreground">Hello,</p>
          <BodyParagraph>Today, we will discuss one of <BlogBrandName />’s special and highly useful tools called <Link href="/resize-image-to-exact-kb" className="font-semibold text-primary underline-offset-4 hover:underline">Resize Image to Exact KB</Link>.</BodyParagraph>
          <BodyParagraph>The main purpose of creating this tool was to help students, competitive exam candidates, and people filling out online forms for government or private-sector recruitment.</BodyParagraph>
          <BodyParagraph>Many recruitment forms require applicants to upload a photograph, signature, or document image in a specific file size. For example, a form may require an image of 20 KB, 50 KB, 100 KB, or 200 KB. For an ordinary person, resizing an image to the required file size can be difficult.</BodyParagraph>
          <BodyParagraph>This problem is even greater for people living in villages or remote areas. They may not have access to a nearby cyber café or similar service and may have to travel a long distance just to resize an image.</BodyParagraph>
          <BodyParagraph>After seeing these difficulties, we created the Resize Image to Exact KB tool. Its main purpose is to provide a simple solution to this common problem.</BodyParagraph>
          <BodyParagraph>With this tool, users can resize an image according to the requirements of their form or document. They can prepare images in sizes such as 20 KB, 50 KB, 100 KB, 200 KB, or another custom size.</BodyParagraph>
          <BodyParagraph>We hope that <BlogBrandName />’s Resize Image to Exact KB tool will be useful for students, job applicants, and everyone who needs to prepare images for online forms.</BodyParagraph>
        </div>

        <div className="mt-12 space-y-12">
          <ArticleSection title="Why I Created This Tool">
            <BodyParagraph>I created this tool after seeing students and job applicants struggle to prepare photographs and documents for online forms, especially in villages and remote areas where cyber café services may not be easily available. Some applicants have to travel a long distance only to resize a photograph or signature to the required file size. <BlogBrandName />’s Resize Image to Exact KB tool was created to make this process easier and more accessible.</BodyParagraph>
          </ArticleSection>

          <ArticleSection title="How to Resize an Image to an Exact KB Size">
            <ul className="space-y-3">
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Open the <BlogBrandName /> <Link href="/resize-image-to-exact-kb" className="font-semibold text-primary underline-offset-4 hover:underline">Resize Image to Exact KB tool</Link>.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Upload a JPG, JPEG, PNG, or WebP image.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Enter the required target size, such as 20 KB, 50 KB, 100 KB, or 200 KB.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Process the image.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Preview the final result.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Download the resized image to a mobile phone or computer.</span></li>
              <li className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Upload the downloaded image to the required application form.</span></li>
            </ul>
            <div className="pt-2"><ArticleCta /></div>
          </ArticleSection>

          <ArticleSection title="Where Is an Exact KB Image Required?">
            <ul className="grid gap-3 sm:grid-cols-2">
              {requiredPlaces.map((item) => (
                <li key={item} className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <aside className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>Always read the official form instructions before resizing an image because the required file size, dimensions, and format may be different for every application.</p>
            </aside>
          </ArticleSection>

          <ArticleSection title="Examples of Common Image Size Requirements">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-muted/60 text-foreground">
                  <tr>
                    <th scope="col" className="w-1/3 px-4 py-3 font-semibold">Required Size</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Possible Use</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><th scope="row" className="px-4 py-3 font-semibold text-foreground">20 KB</th><td className="px-4 py-3">Signature or small photograph</td></tr>
                  <tr><th scope="row" className="px-4 py-3 font-semibold text-foreground">50 KB</th><td className="px-4 py-3">Passport-size photograph</td></tr>
                  <tr><th scope="row" className="px-4 py-3 font-semibold text-foreground">100 KB</th><td className="px-4 py-3">Photograph or identity document</td></tr>
                  <tr><th scope="row" className="px-4 py-3 font-semibold text-foreground">200 KB</th><td className="px-4 py-3">Certificate or scanned document</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm italic">These are general examples only. Applicants should always follow the exact requirements mentioned on the official application website or recruitment notification.</p>
          </ArticleSection>

          <ArticleSection title={<>Why Use <BlogBrandName /> Resize Image to Exact KB?</>}>
            <ul className="space-y-3">
              {benefits.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <BodyParagraph>The exact-KB workflow runs in the browser using local image and canvas processing. If you need different dimensions before reducing file size, try <Link href="/resize-image" className="font-semibold text-primary underline-offset-4 hover:underline">Resize Image</Link>. You can also use <Link href="/compress-image" className="font-semibold text-primary underline-offset-4 hover:underline">Compress Image</Link> or <Link href="/crop-image" className="font-semibold text-primary underline-offset-4 hover:underline">Crop Image</Link> when those workflows better match the form instructions.</BodyParagraph>
          </ArticleSection>

          <ArticleSection title="Important Tips Before Uploading Your Image">
            <ul className="space-y-3">
              {tips.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </ArticleSection>

          <ArticleSection title="Common Mistakes to Avoid">
            <ul className="space-y-3">
              {mistakes.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <XCircle className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </ArticleSection>

          <ArticleSection title="Useful Tools for Recruitment Forms">
            <BodyParagraph>Some recruitment portals publish more specific photograph or signature rules. <BlogBrandName /> also provides dedicated helpers for <Link href="/ssc-photo-resize" className="font-semibold text-primary underline-offset-4 hover:underline">SSC photo resizing</Link>, <Link href="/rrb-signature-resize" className="font-semibold text-primary underline-offset-4 hover:underline">RRB signature resizing</Link>, <Link href="/ibps-photo-resize" className="font-semibold text-primary underline-offset-4 hover:underline">IBPS photo and signature preparation</Link>, and <Link href="/ojas-photo-resize" className="font-semibold text-primary underline-offset-4 hover:underline">OJAS photo resizing</Link>. Always compare the selected tool with the current official notification before preparing a file.</BodyParagraph>
          </ArticleSection>

          <ArticleSection title="Frequently Asked Questions">
            <div className="divide-y divide-border rounded-lg border border-border px-4 sm:px-5">
              {resizeImageExactKbFaq.map((item) => (
                <section key={item.question} className="py-5 first:pt-4 last:pb-4">
                  <h3 className="text-lg font-semibold text-foreground">{item.question}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground"><BlogBrandPhrase text={item.answer} /></p>
                </section>
              ))}
            </div>
          </ArticleSection>

          <ArticleSection title="Conclusion">
            <BodyParagraph><BlogBrandName />’s Resize Image to Exact KB tool was created to reduce the difficulty students and applicants face when preparing photographs, signatures, and document images for online forms. Check the official requirements, process the image, preview it carefully, and keep the original file before submitting your application.</BodyParagraph>
            <div className="pt-2"><ArticleCta /></div>
          </ArticleSection>
        </div>

        <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <p><span className="font-semibold text-foreground">Anand Joshi</span><br />Founder of <BlogBrandName /></p>
          <Link href="/blog" className="mt-5 inline-flex items-center gap-2 font-semibold text-primary hover:underline">View all <BlogBrandName /> articles <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </article>
  );
}
