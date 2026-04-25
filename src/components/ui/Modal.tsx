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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#2D3E10]/40 p-4 backdrop-blur-sm animate-in fade-in duration-500">
      <div 
        className={`relative mx-auto w-full ${maxWidthClassName ?? "max-w-lg"} animate-in zoom-in-95 slide-in-from-bottom-10 duration-700 ease-out`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white shadow-2xl shadow-[#2D3E10]/20">
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-[#E8E8E1]/60 px-8 py-6 bg-[#F1F3EE]/30">
            <div className="relative z-10">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#2D3E10]">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2D3E10]/40 shadow-sm transition-all hover:bg-primary hover:text-white hover:rotate-90 border border-[#E8E8E1]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-[#E8E8E1] scrollbar-track-transparent">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

