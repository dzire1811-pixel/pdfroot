import Link from "next/link";
import { LogoMark } from "@/components/Brand";

export const metadata = {
  title: "Login to PDFRoot",
  description: "Login to PDFRoot, the Smart PDF & Image Toolkit.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <Link href="/" className="mx-auto mb-8 inline-flex rounded-md p-1" aria-label="PDFRoot home">
          <LogoMark />
        </Link>
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Login to PDFRoot</h1>
          <p className="mt-3 leading-7 text-slate-600">Access your PDF and image toolkit dashboard.</p>
          <div className="mt-7 grid gap-4">
            <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF2D2D]" placeholder="Email address" />
            <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF2D2D]" placeholder="Password" type="password" />
            <Link href="/dashboard" className="rounded-full bg-[#FF2D2D] px-5 py-3 text-center text-sm font-black text-white shadow-[0_16px_35px_rgba(255,45,45,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600">
              Login
            </Link>
          </div>
          <p className="mt-6 text-center text-sm font-semibold text-slate-600">
            New to PDFRoot?{" "}
            <Link href="/signup" className="text-[#FF2D2D]">
              Sign up
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
