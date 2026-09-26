"use client";

import { useEffect } from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
  maxWidthClassName,
  variant = "default",
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
  variant?: "default" | "sanctuary";
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

  const isSanctuary = variant === "sanctuary";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-300 ${
        isSanctuary ? "bg-black/75" : "bg-[#2D3E10]/40"
      }`}
    >
      <div 
        className={`relative mx-auto w-full ${maxWidthClassName ?? "max-w-lg"} animate-in zoom-in-95 slide-in-from-bottom-6 duration-400 ease-out`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex min-h-[280px] sm:min-h-[380px] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] flex-col overflow-hidden ${
            isSanctuary
              ? "rounded-2xl border border-white/10 bg-[#121C11] text-[#F6F5F0] shadow-2xl shadow-black/80"
              : "rounded-3xl sm:rounded-[2.5rem] border border-[#E8E8E1] bg-white shadow-2xl shadow-[#2D3E10]/20"
          }`}
        >
          {/* Header */}
          <div
            className={`relative flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 ${
              isSanctuary
                ? "border-b border-white/10 bg-[#162415]"
                : "border-b border-[#E8E8E1]/60 px-4 py-3.5 sm:px-8 sm:py-5 bg-[#F1F3EE]/30"
            }`}
          >
            <div className="relative z-10">
              <h3
                className={
                  isSanctuary
                    ? "font-serif text-base sm:text-lg font-normal tracking-wide text-[#F6F5F0]"
                    : "text-xs sm:text-sm font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-[#2D3E10]"
                }
              >
                {title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`group relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg transition-all ${
                isSanctuary
                  ? "bg-[#121C11] text-[#F6F5F0]/70 border border-white/10 hover:text-[#86A86C] hover:border-[#86A86C]/40"
                  : "rounded-xl bg-white text-[#2D3E10]/60 shadow-sm hover:bg-primary hover:text-white hover:rotate-90 border border-[#E8E8E1]"
              }`}
            >
              <svg className="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin ${
              isSanctuary
                ? "scrollbar-thumb-white/10 scrollbar-track-transparent text-[#F6F5F0]"
                : "scrollbar-thumb-[#E8E8E1] scrollbar-track-transparent"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

