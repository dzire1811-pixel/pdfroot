"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

function useComingSoonNotice() {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isOpen, showNotice };
}

function ComingSoonToast({ isOpen }: { isOpen: boolean }) {
  if (!isOpen) return null;

  return (
    <div
      data-coming-soon-toast="true"
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[200] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-xl border border-border bg-card px-4 py-3 text-left text-foreground shadow-2xl sm:bottom-6"
    >
      <p className="text-sm font-semibold">Coming Soon</p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        This tool is currently under development and will be available soon.
      </p>
    </div>
  );
}

export function ComingSoonButton({
  toolName,
  toolSlug,
  className,
  style,
  children,
}: {
  toolName: string;
  toolSlug: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { isOpen, showNotice } = useComingSoonNotice();

  return (
    <>
      <button
        type="button"
        data-tool-card-slug={toolSlug}
        onClick={showNotice}
        style={style}
        className={className}
        aria-label={`${toolName}. Coming Soon. Show availability message.`}
      >
        {children}
      </button>
      <ComingSoonToast isOpen={isOpen} />
    </>
  );
}
