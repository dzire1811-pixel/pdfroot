"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ConfirmationRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <p className="mt-5 text-xs font-medium text-[#98702b]">Checking activation every few seconds…</p>;
}
