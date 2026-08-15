import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import { ToolCard } from "@/components/ToolCard";
import { getToolBySlug, type Tool } from "@/lib/tools";

const featureItems = [
  "Crop any required area of an image",
  "Create multiple copies of the uploaded image",
  "Set the required width and height",
  "Adjust image dimensions in pixels or centimetres",
  "Set the required image size in KB",
  "Rotate the image left or right",
  "Flip the image horizontally or vertically",
  "Rename the output file",
  "Preview the image before saving",
  "Save multiple cropped images to your device",
];

const onlineFormFiles = [
  "Passport-size photographs",
  "Signatures",
  "Thumb impressions",
  "Handwritten declarations",
  "Identity documents",
  "Certificates",
  "Scanned supporting documents",
];

const exploreTools = [
  "crop-image",
  "resize-image-to-exact-kb",
  "compress-image",
  "image-compressor-for-government-forms",
]
  .map((slug) => getToolBySlug(slug))
  .filter((tool): tool is Tool => Boolean(tool));

const inlineLinkClassName =
  "font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";

function ArticleSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[1.02rem] leading-8 text-muted-foreground">{children}</div>
    </section>
  );
}

function BodyParagraph({ text }: { text: string }) {
  return (
    <p className="text-left sm:text-justify sm:[text-justify:inter-word]">
      <BrandPhrase text={text} styled />
    </p>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CropImageCta() {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/60 p-5 text-center sm:p-6">
      <Link
        href="/crop-image"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      >
        Try Crop Image Tool
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Crop, copy, resize and prepare multiple online-form images in one workspace.
      </p>
    </div>
  );
}

export function CropImageToolArticle() {
  return (
    <article className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm">
      <div className="p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-5 text-sm text-muted-foreground">
          <span>By <span className="font-semibold text-foreground">Anand Joshi, Founder of <BrandText styled /></span></span>
          <span aria-hidden="true">•</span>
          <span>Published <time dateTime="2026-07-25">25 July 2026</time></span>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-white p-2 shadow-sm sm:p-4">
          <Image
            src="/blog/pdfroot-crop-image-tool-a4-document.webp"
            alt="PDFRoot Crop Image Tool showing an A4 document ready for cropping and image preparation"
            width={1724}
            height={816}
            priority
            className="h-auto w-full rounded-lg border border-border object-contain"
            sizes="(max-width: 768px) calc(100vw - 4rem), 832px"
          />
        </div>

        <div className="mt-8 space-y-5 text-[1.03rem] leading-8 text-muted-foreground">
          <p className="font-semibold text-foreground">Hello friends,</p>
          <BodyParagraph text="Today, I would like to introduce the PDFRoot Crop Image Tool and explain what makes it different from ordinary online cropping tools." />
          <BodyParagraph text="Many websites allow users to crop an image, but most of them are limited to basic cropping. PDFRoot has been designed as a smart and practical crop image tool, especially for students, teachers, cyber cafés, offices, and people filling out government or private online forms." />
          <p>
            Open{" "}
            <Link href="/crop-image" className={inlineLinkClassName}>
              Crop Image Online
            </Link>{" "}
            whenever you need to prepare several photos, signatures, or document images in one workspace.
          </p>
        </div>

        <div className="mt-8">
          <CropImageCta />
        </div>

        <div className="mt-12 space-y-12">
          <ArticleSection title="Crop Multiple Images from One A4 Page">
            <BodyParagraph text="Suppose you have an A4-size scanned page containing a photograph, signature, thumb impression, or several document images." />
            <BodyParagraph text="Normally, you may need to upload the same page repeatedly to crop each item separately. With PDFRoot, you can easily create multiple copies of the uploaded page." />
            <h3 className="pt-1 text-xl font-semibold tracking-tight text-foreground">A practical example</h3>
            <CheckList
              items={[
                "Use the first copy to crop the photograph.",
                "Use the second copy to crop the signature.",
                "Use the third copy to crop another document or image.",
              ]}
            />
            <BodyParagraph text="After completing one crop, the next copy of the same page is ready for editing. This allows you to create several separate images without uploading the same file again and again." />
          </ArticleSection>

          <ArticleSection title="More Than a Basic Crop Tool">
            <BodyParagraph text="The PDFRoot Crop Image Tool provides several useful options in one place." />
            <h3 className="pt-1 text-xl font-semibold tracking-tight text-foreground">Everything you can do in one workspace</h3>
            <CheckList items={featureItems} />
            <BodyParagraph text="These features make the tool useful for online applications where photographs, signatures, thumb impressions, and documents must follow specific size and dimension requirements." />
            <p>
              After cropping, use{" "}
              <Link href="/resize-image-to-exact-kb" className={inlineLinkClassName}>
                Resize Image to Exact KB
              </Link>{" "}
              when a form requires a precise file size, or{" "}
              <Link href="/compress-image" className={inlineLinkClassName}>
                Compress Image Online
              </Link>{" "}
              when you only need to reduce the file.
            </p>
          </ArticleSection>

          <ArticleSection title="Why Was This Tool Created?">
            <BodyParagraph text="Many government and private schools now have computers and internet facilities. However, teachers and staff may still need to travel to cyber cafés or other service centres to complete online student forms." />
            <BodyParagraph text="I once asked some teachers why they travelled so far for this work even though their schools had computers and internet access." />
            <BodyParagraph text="They explained that preparing the required photograph size, setting the correct dimensions and KB, and cropping several separate images from one scanned page was difficult for them." />
            <BodyParagraph text="As a result, they had to spend valuable time travelling and completing work outside the school. Their absence could also affect students and regular school activities." />
            <BodyParagraph text="After hearing about this problem, the idea of creating the PDFRoot Crop Image Tool was born." />
            <BodyParagraph text="The main purpose was to provide a simple tool that could help teachers, students, institutions, cyber cafés, offices, and general users complete image-related work without requiring advanced editing knowledge." />
          </ArticleSection>

          <ArticleSection title="Useful for Government and Private Online Forms">
            <BodyParagraph text="Online application forms often require files such as:" />
            <h3 className="pt-1 text-xl font-semibold tracking-tight text-foreground">Common files you can prepare</h3>
            <CheckList items={onlineFormFiles} />
            <BodyParagraph text="Each file may require a specific width, height, file format, or KB limit. PDFRoot helps users crop and prepare these images from one convenient workspace." />
            <p>
              Explore the{" "}
              <Link href="/tools" className={inlineLinkClassName}>
                Government Recruitment Resize Tools
              </Link>{" "}
              for application-specific photo, signature, and document workflows.
            </p>
          </ArticleSection>

          <ArticleSection title="Easy to Use on Mobile and Desktop">
            <BodyParagraph text="The tool is designed to work on both mobile phones and desktop computers. Its simple controls allow users to upload an image, select the required area, adjust its settings, and save the final result." />
            <BodyParagraph text="Users do not need professional photo-editing software or advanced technical knowledge." />
          </ArticleSection>

          <ArticleSection title="A Complete Image Preparation Solution">
            <BodyParagraph text="There are many crop image tools available online, but PDFRoot is designed around the practical needs of people completing online forms." />
            <BodyParagraph text="Instead of providing only a basic cropping feature, it brings together copying, cropping, resizing, dimension settings, KB settings, rotation, flipping, renaming, previewing, and saving in one simple tool." />
            <p className="font-semibold text-foreground">
              <BrandPhrase text="PDFRoot Crop Image Tool is not just a cropping tool. It is a complete and easy solution for preparing photos, signatures, and documents for online applications." styled />
            </p>
            <p className="font-semibold text-foreground">
              <BrandText styled /> — All PDF &amp; Image Tools in One Place
            </p>
            <div className="pt-2">
              <CropImageCta />
            </div>
          </ArticleSection>

          <ArticleSection title={<>Explore More <BrandText styled /> Tools</>}>
            <p>
              Continue with the tool that matches your next image-preparation step, or browse all{" "}
              <Link href="/tools" className={inlineLinkClassName}>
                PDF and image tools
              </Link>
              .
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {exploreTools.map((tool) => (
                <ToolCard key={tool.slug} tool={tool} compact />
              ))}
            </div>
          </ArticleSection>
        </div>
      </div>
    </article>
  );
}
