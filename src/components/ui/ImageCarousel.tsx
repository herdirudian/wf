"use client";

import { useEffect, useMemo, useState } from "react";

export function ImageCarousel({
  images,
  heightClassName = "h-40",
  className = "rounded-[2rem] border border-[#E8E8E1]",
}: {
  images: string[];
  heightClassName?: string;
  className?: string;
}) {
  const safeImages = useMemo(() => images.filter(Boolean), [images]);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);

  if (!safeImages.length) return null;

  const idx = Math.min(i, safeImages.length - 1);
  const canNav = safeImages.length > 1;

  function prev() {
    setI((v) => (v - 1 + safeImages.length) % safeImages.length);
  }

  function next() {
    setI((v) => (v + 1) % safeImages.length);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, safeImages.length]);

  return (
    <>
      <div className={`relative group/carousel overflow-hidden bg-surface ${className}`}>
        <button type="button" onClick={() => setOpen(true)} className="block h-full w-full overflow-hidden">
          <img
            src={safeImages[idx]}
            alt=""
            className={`h-full w-full object-cover cursor-zoom-in transition-transform duration-700 group-hover/carousel:scale-110`}
            loading="lazy"
          />
        </button>

        {canNav ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                prev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#2D3E10] shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-white hover:scale-110 active:scale-95 opacity-0 group-hover/carousel:opacity-100 -translate-x-4 group-hover/carousel:translate-x-0"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                next();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#2D3E10] shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-white hover:scale-110 active:scale-95 opacity-0 group-hover/carousel:opacity-100 translate-x-4 group-hover/carousel:translate-x-0"
              aria-label="Next image"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {safeImages.map((_, di) => (
                <button
                  key={di}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setI(di);
                  }}
                  className={`h-1.5 transition-all duration-500 rounded-full ${di === idx ? "w-6 bg-primary" : "w-1.5 bg-white/60 hover:bg-white"} shadow-sm`}
                  aria-label={`Go to image ${di + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 transition-all duration-500 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-5xl animate-in zoom-in-95 duration-500">
            <div className="absolute -top-14 right-0 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 hover:rotate-90 active:scale-90"
              >
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-hidden rounded-[2.5rem] bg-black shadow-2xl">
              <img
                src={safeImages[idx]}
                alt=""
                className="mx-auto max-h-[80dvh] w-full object-contain"
                loading="lazy"
              />
            </div>

            {canNav ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20 hover:scale-110 active:scale-95"
                >
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20 hover:scale-110 active:scale-95"
                >
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <div className="mt-6 flex justify-center gap-2">
                  {safeImages.map((_, di) => (
                    <button
                      key={di}
                      type="button"
                      onClick={() => setI(di)}
                      className={`h-1.5 transition-all duration-500 rounded-full ${di === idx ? "w-8 bg-white" : "w-1.5 bg-white/20 hover:bg-white/40"}`}
                      aria-label={`Go to image ${di + 1}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
