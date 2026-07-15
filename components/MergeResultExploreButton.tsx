"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";

const RELEASE_DELAY_MS = 180;

export function MergeResultExploreButton({ category }: { category?: string }) {
  const router = useRouter();
  const [isPressed, setIsPressed] = useState(false);
  const isPressedRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target =
    category === "Image Tools"
      ? { href: "/#image-tools", label: "Explore All Image Tools" }
      : category === "PDF Tools"
        ? { href: "/#pdf-tools", label: "Explore All PDF Tools" }
        : { href: "/tools", label: "Explore All Tools" };

  const clearReleaseTimer = () => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  };

  const press = () => {
    clearReleaseTimer();
    isPressedRef.current = true;
    setIsPressed(true);
  };

  const release = () => {
    clearReleaseTimer();
    releaseTimerRef.current = setTimeout(() => {
      isPressedRef.current = false;
      setIsPressed(false);
      releaseTimerRef.current = null;
    }, RELEASE_DELAY_MS);
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPressedRef.current || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    setTimeout(() => router.push(target.href), RELEASE_DELAY_MS);
  };

  useEffect(() => () => clearReleaseTimer(), []);

  return (
    <Link
      href={target.href}
      onClick={handleClick}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
      style={{
        touchAction: "manipulation",
        ...(isPressed
          ? {
              backgroundColor: "color-mix(in oklch, var(--primary) 82%, black)",
              boxShadow: "0 2px 5px rgb(15 23 42 / 10%)",
              transform: "translateY(2px) scale(0.95)",
            }
          : {}),
      }}
    >
      {target.label}
    </Link>
  );
}
