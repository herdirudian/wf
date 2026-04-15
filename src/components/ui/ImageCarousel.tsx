"use client";

import { useEffect, useMemo, useState } from "react";

export function ImageCarousel({
  images,
  heightClassName = "h-40",
}: {
  images: string[];
  heightClassName?: string;
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
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <button type="button" onClick={() => setOpen(true)} className="block w-full">
          <img
            src={safeImages[idx]}
            alt=""
            className={`w-full object-cover ${heightClassName} cursor-zoom-in`}
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
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 px-3 py-1 text-sm font-medium text-foreground shadow hover:bg-surface"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                next();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 px-3 py-1 text-sm font-medium text-foreground shadow hover:bg-surface"
            >
              Next
            </button>
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
              {safeImages.map((_, di) => (
                <button
                  key={di}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setI(di);
                  }}
                  className={`h-2 w-2 rounded-full ${di === idx ? "bg-primary" : "bg-surface/80"} shadow`}
                  aria-label={`Go to image ${di + 1}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-5xl">
            <div className="absolute right-0 top-0 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-surface/90 px-3 py-2 text-sm font-medium text-foreground shadow hover:bg-surface"
              >
                Tutup
              </button>
            </div>

            <div className="mt-12 overflow-hidden rounded-2xl bg-black">
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
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 px-3 py-2 text-sm font-medium text-foreground shadow hover:bg-surface"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 px-3 py-2 text-sm font-medium text-foreground shadow hover:bg-surface"
                >
                  Next
                </button>
                <div className="mt-3 flex justify-center gap-1">
                  {safeImages.map((_, di) => (
                    <button
                      key={di}
                      type="button"
                      onClick={() => setI(di)}
                      className={`h-2 w-2 rounded-full ${di === idx ? "bg-white" : "bg-white/40"}`}
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
