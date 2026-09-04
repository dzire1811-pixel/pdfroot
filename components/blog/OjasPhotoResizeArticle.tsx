import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { BrandPhrase, BrandText } from "@/components/Brand";
import type { BlogPost } from "@/lib/blog";

const linkClass = "font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"><BrandPhrase text={title} styled /></h2><div className="mt-4 space-y-4 text-[1.02rem] leading-8 text-muted-foreground">{children}</div></section>;
}

export function OjasPhotoResizeArticle({ post }: { post: BlogPost }) {
  return (
    <article lang="en" className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm">
      <div className="space-y-8 p-5 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-5 text-sm text-muted-foreground">
          <span>By <span className="font-semibold text-foreground">Anand Joshi, Founder of <BrandText styled /></span></span>
          <span aria-hidden="true">•</span>
          <span>Published <time dateTime={post.publishedAt}>{post.date}</time></span>
          <span>{post.readTime}</span>
        </div>
        <div className="space-y-4 text-[1.02rem] leading-8 text-muted-foreground">
          <p>{post.content.intro}</p>
          <p>While filling out these forms, candidates are required to enter their personal and educational details and upload important files such as their photograph and signature.</p>
          <p>This is where a very common problem begins:</p>
          <p><strong className="text-foreground">How do you resize a photo or signature to the exact dimensions and file size required by the recruitment form?</strong></p>
        </div>
        <Section title="The Problem We Heard from Students">
          <p>While building <BrandText styled />, we spoke with several students preparing for competitive examinations and government jobs.</p>
          <p>We asked them about the difficulties they face while filling out online recruitment forms.</p>
          <p>One problem came up repeatedly:</p>
          <p><strong className="text-foreground">Resizing a photograph and signature to the required KB size.</strong></p>
          <p>Many candidates use photographs taken with a smartphone or camera. These files are usually much larger than the file size accepted by government recruitment portals.</p>
          <p>Candidates may also need to meet specific image dimensions at the same time.</p>
          <p>For someone who is not familiar with image editing, compression, dimensions or KB limits, what looks like a simple task can quickly become frustrating.</p>
          <p>One example from the OJAS application system clearly shows why this becomes difficult for many candidates. The portal requires applicants to prepare their photograph and signature within specific dimensions while also keeping the file size within a maximum limit of 15 KB.</p>
        </Section>
        <div className="space-y-4 text-[1.02rem] leading-8 text-muted-foreground">
          {post.image && (
            <figure>
              <Image src={post.image.src} alt="OJAS Gujarat photo and signature upload requirements showing maximum 15 KB file size" width={post.image.width} height={post.image.height} sizes="(max-width: 640px) calc(100vw - 88px), (max-width: 1024px) calc(100vw - 112px), 814px" className="h-auto w-full rounded-lg border border-border object-contain" />
              <figcaption className="mt-3 text-sm leading-6 text-muted-foreground">Example of OJAS photo and signature upload requirements. Requirements may vary by recruitment.</figcaption>
            </figure>
          )}
          <p>For users who are unfamiliar with image dimensions, compression and KB limits, meeting all of these requirements at the same time can be confusing. This is exactly the type of problem <BrandText styled /> was created to simplify.</p>
          <aside aria-label="Example OJAS requirements" className="rounded-xl border border-red-100 bg-red-50/60 p-5 sm:p-6">
            <dl className="grid gap-5 text-foreground sm:grid-cols-2">
              <div><dt className="font-semibold">Photo</dt><dd>5 cm × 3.6 cm</dd><dd>Maximum 15 KB</dd></div>
              <div><dt className="font-semibold">Signature</dt><dd>2.5 cm × 7.5 cm</dd><dd>Maximum 15 KB</dd></div>
            </dl>
            <p className="mt-3 text-sm leading-6">Example requirements only. Always check the instructions for your recruitment.</p>
          </aside>
        </div>
        <Section title="This Problem Inspired PDFRoot">
          <p>We realized that this was not a problem faced by just one or two students.</p>
          <p>Many candidates preparing for government jobs were struggling with the same issue while filling out OJAS and other recruitment forms.</p>
          <p>That is why we decided to create simple tools on <BrandText styled />.com that could make this process easier.</p>
          <p>One of those tools is the <Link className={linkClass} href="/ojas-photo-resize">OJAS Photo Resize Tool</Link>.</p>
        </Section>
        <Section title="What Is the OJAS Photo Resize Tool?">
          <p>The purpose of the OJAS Photo Resize Tool is simple:</p>
          <p>Upload your photo, adjust it according to the recruitment requirements, and prepare it for submission without using complicated photo-editing software.</p>
          <p>With <BrandText styled />, users can easily:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Resize a photo</li>
            <li>Crop a photo with <Link className={linkClass} href="/crop-image">Crop Image</Link></li>
            <li>Reduce image file size in KB with <Link className={linkClass} href="/resize-image-to-exact-kb">Resize Image to Exact KB</Link></li>
            <li>Resize a signature with <Link className={linkClass} href="/signature-resize-tool">Signature Resize</Link></li>
            <li>Compress images for recruitment forms with <Link className={linkClass} href="/compress-image">Compress Image</Link></li>
            <li>Prepare photos for government job applications</li>
          </ul>
          <p>The goal is to make the process simple enough for anyone to use, even without technical or photo-editing knowledge.</p>
        </Section>
        <Section title="No Technical Knowledge Required">
          <p>A candidate should not have to learn professional photo-editing software just to submit a government recruitment form.</p>
          <p>That was one of the main ideas behind <BrandText styled />.</p>
          <p>Users can select their photo from a mobile phone or computer, make the required adjustments and prepare the image in just a few steps.</p>
          <p>Today, people use <BrandText styled /> tools such as the OJAS Photo Resize Tool to make their recruitment application process easier.</p>
          <p>Seeing users successfully complete their work with these tools is one of the biggest reasons we continue improving <BrandText styled />.</p>
        </Section>
        <Section title="PDFRoot Is Built to Solve Real Problems">
          <p><BrandText styled /> is not only about creating common tools such as PDF Merge, PDF Compress or PDF Convert.</p>
          <p>Our goal is also to solve small but important problems faced by students, government job applicants, cyber cafe operators and everyday users.</p>
          <p>The OJAS Photo Resize Tool is one such example.</p>
          <p>It was created after understanding a real problem faced by candidates preparing for competitive examinations and government recruitment.</p>
          <p>We will continue building useful tools that make it easier to prepare photographs, signatures, PDFs and documents for online applications.</p>
        </Section>
        <section className="rounded-xl border border-red-100 bg-red-50/60 p-5 text-center sm:p-6">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Need to Prepare Your Photo for OJAS?</h2>
          <p className="mb-5 mt-3 leading-7 text-muted-foreground">Use <BrandText styled /> to resize, crop and compress your photo or signature for online recruitment forms.</p>
          <Link href="/ojas-photo-resize" className="inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2">Resize OJAS Photo<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
        </section>
        <p className="font-semibold leading-7 text-foreground"><BrandText styled />.com — A simple way to prepare Photos, PDFs and Documents for Government Forms.</p>
        <p className="border-t border-border pt-5 text-sm leading-7 text-muted-foreground"><strong>Note:</strong> Photo size, signature size, dimensions, format and KB limits may vary from one recruitment notification to another. Always check the official recruitment instructions before preparing and uploading your files.</p>
        <Link href="/blog" className={linkClass}>Back to blog</Link>
      </div>
    </article>
  );
}
