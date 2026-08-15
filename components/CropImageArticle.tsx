import Link from "next/link";
import type { ReactNode } from "react";

const linkClassName =
  "font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";

function ArticleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0 sm:mt-10">
      <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h3>
      <div className="mt-4 space-y-4 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function ArticleList({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 marker:text-primary">{children}</ul>;
}

export function CropImageArticle() {
  return (
    <section
      data-tool-page-extra="article"
      aria-labelledby="crop-image-article-title"
      className="border-t border-border bg-muted/40 px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <article className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-6 text-left shadow-sm sm:p-8 lg:p-10">
        <header className="border-b border-border pb-6 sm:pb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Crop Image Guide</p>
          <h2
            id="crop-image-article-title"
            className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl"
          >
            PDFRoot Crop Image Tool: A Smart Solution for Online Form Photos and Documents
          </h2>
          <div className="mt-5 space-y-4 text-base leading-7 text-muted-foreground">
            <p>Hello friends,</p>
            <p>
              Today, I would like to introduce the <strong className="font-semibold text-foreground">PDFRoot Crop Image Tool</strong> and explain what makes it different from ordinary online cropping tools.
            </p>
            <p>
              Many websites allow users to crop an image, but most are limited to basic cropping. PDFRoot is a smart and practical crop image tool designed especially for students, teachers, cyber cafés, offices, and people filling out government or private <strong className="font-semibold text-foreground">online application forms</strong>.
            </p>
          </div>
        </header>

        <ArticleSection title="Crop Multiple Images from One A4 Page">
          <p>
            Suppose you have an A4-size scanned page containing a photograph, signature, thumb impression, or several document images. With PDFRoot, you can <strong className="font-semibold text-foreground">crop multiple images from one A4 page</strong> without uploading the same file again and again.
          </p>
          <p>Create multiple copies of the uploaded page, then use each copy for a different item:</p>
          <ArticleList>
            <li>Use the first copy to crop the photograph.</li>
            <li>Use the second copy to crop the signature.</li>
            <li>Use the third copy to crop another document or image.</li>
          </ArticleList>
          <p>
            After completing one crop, the next copy of the same page is ready for editing. This makes it easy to create several separate images from a single scan.
          </p>
        </ArticleSection>

        <ArticleSection title="More Than a Basic Crop Tool">
          <p>The PDFRoot Crop Image Tool brings several useful options together in one workspace. You can:</p>
          <ArticleList>
            <li>Crop any required area of an image.</li>
            <li>Create multiple copies of the uploaded image.</li>
            <li>Set the required width and height.</li>
            <li><strong className="font-semibold text-foreground">Set image dimensions</strong> in pixels or centimetres.</li>
            <li><strong className="font-semibold text-foreground">Set image size in KB</strong>.</li>
            <li>Rotate the image left or right.</li>
            <li>Flip the image horizontally or vertically.</li>
            <li>Rename the output file.</li>
            <li>Preview the image before saving.</li>
            <li>Save multiple cropped images to your device.</li>
          </ArticleList>
          <p>
            For additional file-size control, use{" "}
            <Link href="/resize-image-to-exact-kb" className={linkClassName}>
              Resize Image to Exact KB
            </Link>
            . If you only need to reduce a file, try{" "}
            <Link href="/compress-image" className={linkClassName}>
              Compress Image Online
            </Link>
            .
          </p>
        </ArticleSection>

        <ArticleSection title="Why Was This Tool Created?">
          <p>
            Many government and private schools now have computers and internet facilities. However, teachers and staff may still need to travel to cyber cafés or service centres to complete online student forms.
          </p>
          <p>
            When I asked teachers why they travelled so far despite having computers and internet access at school, they explained that preparing the required photograph size, setting the correct dimensions and KB, and cropping several separate images from one scanned page was difficult.
          </p>
          <p>
            This work took valuable time away from school and could affect students and regular activities. That practical problem inspired the PDFRoot Crop Image Tool.
          </p>
          <p>
            Its purpose is to help teachers, students, institutions, cyber cafés, offices, and general users complete image-related work without advanced editing knowledge.
          </p>
        </ArticleSection>

        <ArticleSection title="Useful for Government and Private Online Forms">
          <p>Online application forms often require files such as:</p>
          <ArticleList>
            <li>Passport-size photographs.</li>
            <li>Signatures.</li>
            <li>Thumb impressions.</li>
            <li>Handwritten declarations.</li>
            <li>Identity documents.</li>
            <li>Certificates and scanned supporting documents.</li>
          </ArticleList>
          <p>
            Each file may need a specific width, height, format, or KB limit. PDFRoot helps users crop and prepare these images in one convenient workspace. You can also explore the{" "}
            <Link href="/tools" className={linkClassName}>
              Government Recruitment Resize Tools
            </Link>{" "}
            for application-specific photo, signature, and document requirements.
          </p>
        </ArticleSection>

        <ArticleSection title="Easy to Use on Mobile and Desktop">
          <p>
            The tool works on mobile phones and desktop computers. Its straightforward controls let you upload an image, select the required area, adjust its settings, preview the result, and save the final image.
          </p>
          <p>You do not need professional photo-editing software or advanced technical knowledge.</p>
        </ArticleSection>

        <ArticleSection title="A Complete Image Preparation Solution">
          <p>
            Many crop image tools provide only basic cropping. PDFRoot is designed around the practical needs of people completing online forms, bringing copying, cropping, resizing, dimension settings, KB settings, rotation, flipping, renaming, previewing, and saving into one simple tool.
          </p>
          <p className="font-semibold text-foreground">
            PDFRoot Crop Image Tool is not just a cropping tool. It is a complete and easy solution for preparing photos, signatures, and documents for online applications.
          </p>
          <p className="font-semibold text-foreground">PDFRoot — All PDF &amp; Image Tools in One Place</p>
        </ArticleSection>
      </article>
    </section>
  );
}
