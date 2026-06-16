import Link from "next/link";
import { FileArchive, ImageUp, Layers3 } from "lucide-react";
import { LogoMark } from "@/components/Brand";

export const metadata = {
  title: "PDFRoot Dashboard",
  description: "PDFRoot dashboard for PDF and image toolkit workflows.",
};

export default function DashboardPage() {
  const cards = [
    { title: "PDF Tools", description: "Merge, split, compress, and convert PDF files.", href: "/#pdf-tools", icon: Layers3 },
    { title: "Image Tools", description: "Resize, compress, crop, and convert images.", href: "/#image-tools", icon: ImageUp },
    { title: "Government Forms", description: "Resize photo and signature files to exact KB.", href: "/#government-tools", icon: FileArchive },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="inline-flex rounded-md p-1" aria-label="PDFRoot home">
            <LogoMark />
          </Link>
          <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:border-red-200 hover:text-[#FF2D2D]">
            Home
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-12">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">PDFRoot Dashboard</h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">Choose a PDF or image workflow and continue with the same clean PDFRoot experience.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map(({ title, description, href, icon: Icon }) => (
            <Link key={title} href={href} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:border-red-200">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[#FF2D2D]">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
