import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[100svh] place-items-center bg-background px-6 py-12">
      <section className="text-center" aria-labelledby="not-found-title">
        <Image
          src="/branding/404-page-logo.svg"
          alt="PDFRoot"
          width={430}
          height={160}
          priority
          className="mx-auto h-auto w-full max-w-[280px]"
        />
        <div className="mt-8 flex items-center justify-center gap-5 text-foreground">
          <h1 id="not-found-title" className="text-2xl font-semibold">
            404
          </h1>
          <span className="h-8 w-px bg-border" aria-hidden="true" />
          <p className="text-sm font-medium">This page could not be found.</p>
        </div>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          Return to PDFRoot
        </Link>
      </section>
    </main>
  );
}
