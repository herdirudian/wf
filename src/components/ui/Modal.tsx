"use client";

import { useEffect } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
  maxWidthClassName,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <div className={`mx-auto w-full ${maxWidthClassName ?? "max-w-lg"}`}>
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col rounded-2xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-primary/60 hover:bg-primary/5 hover:text-primary"
            >
              Tutup
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

