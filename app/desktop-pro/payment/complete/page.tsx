import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { paymentConfirmation } from "@/lib/desktop-payment/server";
import { ConfirmationRefresh } from "./refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Desktop Pro payment | PDFRoot",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaymentCompletePage({ searchParams }: Props) {
  let state: "invalid" | "pending" | "active" | "unavailable";
  try { state = await paymentConfirmation(await searchParams); }
  catch { state = "unavailable"; }
  const active = state === "active";
  const pending = state === "pending";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#f5f7fb] text-[#122039]">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#ffe7e9] blur-[110px]" aria-hidden="true" />
      <header className="relative mx-auto flex w-full max-w-[1100px] items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/desktop-pro" aria-label="PDFRoot Desktop Pro home"><Image src="/branding/horizontal-logo.svg" alt="PDFRoot" width={164} height={61} className="h-12 w-auto" priority /></Link>
        <span className="rounded-full border border-[#e4e8ef] bg-white/90 px-3 py-2 text-xs font-semibold text-[#475467] shadow-sm">Desktop Pro</span>
      </header>

      <section className="relative mx-auto flex w-full max-w-[720px] flex-1 items-center px-5 pb-16 pt-5 sm:px-8">
        <div className="w-full overflow-hidden rounded-[28px] border border-[#e6e9ef] bg-white shadow-[0_28px_85px_rgba(16,24,40,0.10)]">
          <div className="h-1.5 bg-[#ef4444]" />
          <div className="px-6 py-9 text-center sm:px-12 sm:py-12" aria-live="polite">
            <span className={`mx-auto grid h-20 w-20 place-items-center rounded-[24px] ${active ? "bg-[#e8f8ed] text-[#159653]" : pending ? "bg-[#fff3e1] text-[#bd771b]" : "bg-[#f0f2f6] text-[#667085]"}`}>
              {active ? <CheckCircle2 className="h-11 w-11" strokeWidth={1.8} aria-hidden="true" /> : <Clock3 className="h-10 w-10" strokeWidth={1.8} aria-hidden="true" />}
            </span>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#d82e3e]">PDFRoot Desktop Pro · 30-day plan</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#111c31] sm:text-[42px]">
              {active ? "Subscription successful" : pending ? "Activating your subscription" : "We could not confirm this payment"}
            </h1>
            <p className="mx-auto mt-4 max-w-[510px] text-sm leading-7 text-[#58667c] sm:text-base">
              {active
                ? "Your payment is confirmed and your 30-day plan is active. PDFRoot Desktop Pro will update automatically on this computer."
                : pending
                  ? "Razorpay confirmed the payment. We are applying your plan now. Keep PDFRoot Desktop Pro open; this page will update automatically."
                  : state === "unavailable"
                    ? "Confirmation is temporarily unavailable. Keep PDFRoot Desktop Pro open while it checks your plan, or contact us if it does not update."
                    : "Open the payment link from PDFRoot Desktop Pro to view your confirmed subscription. If you paid, the app will still check automatically."}
            </p>

            {active ? (
              <div className="mx-auto mt-9 grid max-w-[520px] gap-3 rounded-2xl border border-[#dcefe3] bg-[#f6fcf8] p-5 text-left text-sm text-[#245b3e] sm:grid-cols-2">
                <span className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" aria-hidden="true" /> Payment confirmed</span>
                <span className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" aria-hidden="true" /> Plan activated</span>
              </div>
            ) : null}
            {pending ? <ConfirmationRefresh /> : null}

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/desktop-pro" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-6 font-semibold text-white transition hover:bg-[#d93242] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef4444]">
                PDFRoot Desktop Pro <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d7dde7] px-6 font-semibold text-[#344054] transition hover:bg-[#f8fafc]">Need help?</Link>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-[#eef0f4] bg-[#fafbfc] px-6 py-5 text-center text-xs text-[#667085]"><ShieldCheck className="h-4 w-4 text-[#1f8e5c]" aria-hidden="true" /> Verified payment status · Secured by PDFRoot and Razorpay</div>
        </div>
      </section>
    </main>
  );
}
