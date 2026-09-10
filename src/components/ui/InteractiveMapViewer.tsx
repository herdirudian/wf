"use client";

import React, { useState, useRef, useCallback } from "react";

interface InteractiveMapViewerProps {
  src: string;
  alt?: string;
  className?: string;
  onOpenNewTab?: () => void;
}

export function InteractiveMapViewer({
  src,
  alt = "Site Map Kavling",
  className = "",
  onOpenNewTab,
}: InteractiveMapViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const { scale, tx, ty } = transform;

  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);

  // Clamp translation so image boundaries stay within viewport when zoomed
  const clampTranslation = useCallback((targetScale: number, targetTx: number, targetTy: number) => {
    if (targetScale <= 1) return { tx: 0, ty: 0 };
    const container = containerRef.current;
    if (!container) return { tx: targetTx, ty: targetTy };

    const rect = container.getBoundingClientRect();
    const maxTx = Math.max(0, ((targetScale - 1) * rect.width) / 2);
    const maxTy = Math.max(0, ((targetScale - 1) * rect.height) / 2);

    return {
      tx: Math.max(-maxTx, Math.min(maxTx, targetTx)),
      ty: Math.max(-maxTy, Math.min(maxTy, targetTy)),
    };
  }, []);

  // Smooth zoom to target scale, optionally focusing on mouse position (focusX, focusY)
  const applyZoom = useCallback(
    (newScale: number, focusX?: number, focusY?: number) => {
      const nextScale = Math.max(1, Math.min(5, Number(newScale.toFixed(2))));
      if (nextScale === 1) {
        setTransform({ scale: 1, tx: 0, ty: 0 });
        return;
      }

      setTransform((prev) => {
        if (focusX !== undefined && focusY !== undefined && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const ratio = nextScale / prev.scale;

          const rawTx = (prev.tx - (focusX - centerX)) * ratio + (focusX - centerX);
          const rawTy = (prev.ty - (focusY - centerY)) * ratio + (focusY - centerY);

          const clamped = clampTranslation(nextScale, rawTx, rawTy);
          return { scale: nextScale, tx: clamped.tx, ty: clamped.ty };
        }
        const clamped = clampTranslation(nextScale, prev.tx, prev.ty);
        return { scale: nextScale, tx: clamped.tx, ty: clamped.ty };
      });
    },
    [clampTranslation]
  );

  const zoomIn = () => applyZoom(scale + 0.5);
  const zoomOut = () => applyZoom(scale - 0.5);
  const resetZoom = () => setTransform({ scale: 1, tx: 0, ty: 0 });

  // Wheel zoom over map container
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.15 : 0.87;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    applyZoom(scale * factor, mouseX, mouseY);
  };

  // Double-click to zoom in / out
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1) {
      resetZoom();
    } else {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      applyZoom(2.5, mouseX, mouseY);
    }
  };

  // Drag handling (mouse & touch 1-finger)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const rawTx = dragStartRef.current.tx + dx;
    const rawTy = dragStartRef.current.ty + dy;

    const clamped = clampTranslation(scale, rawTx, rawTy);
    setTransform((prev) => ({ ...prev, tx: clamped.tx, ty: clamped.ty }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Touch Pinch-to-Zoom handling
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartDistRef.current = dist;
      pinchStartScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / pinchStartDistRef.current;
      const targetScale = pinchStartScaleRef.current * ratio;

      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        applyZoom(targetScale, midX, midY);
      } else {
        applyZoom(targetScale);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }
  };

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl sm:rounded-[2rem] border border-[#2D3E10]/20 bg-[#161B11] shadow-2xl select-none ${className}`}>
      {/* Top Floating Controls - Split into 2 compact side pods so top-center image is clear */}
      <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-4 sm:left-4 sm:right-4 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left Pod: Compact Zoom Controls */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-white/95 backdrop-blur-md border border-white/60 shadow-md text-[#2D3E10]">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= 1}
            title="Zoom Out"
            className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-[#F1F3EE] text-xs sm:text-base font-bold text-[#2D3E10] transition-all hover:bg-primary hover:text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 shadow-sm"
          >
            −
          </button>

          {/* Scale Display / Reset */}
          <button
            type="button"
            onClick={resetZoom}
            title="Reset Zoom & Posisi"
            className="flex h-7 sm:h-9 items-center justify-center rounded-lg sm:rounded-xl bg-[#F1F3EE] px-2 sm:px-3 text-[10px] sm:text-xs font-black tracking-wider text-[#2D3E10] transition-all hover:bg-primary hover:text-white active:scale-95 shadow-sm"
          >
            {Math.round(scale * 100)}%
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= 5}
            title="Zoom In"
            className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-[#F1F3EE] text-xs sm:text-base font-bold text-[#2D3E10] transition-all hover:bg-primary hover:text-white disabled:opacity-30 disabled:pointer-events-none active:scale-95 shadow-sm"
          >
            +
          </button>

          {/* Reset Position button (Desktop only when zoomed) */}
          {scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="hidden sm:flex h-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-bold text-primary transition-all hover:bg-primary hover:text-white active:scale-95"
            >
              Reset Posisi
            </button>
          )}
        </div>

        {/* Right Pod: Buka Tab Baru */}
        <div className="pointer-events-auto">
          {onOpenNewTab ? (
            <button
              type="button"
              onClick={onOpenNewTab}
              title="Buka Peta Ukuran Penuh di Tab Baru"
              className="flex h-7 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-xl sm:rounded-2xl border border-white/60 bg-white/95 backdrop-blur-md px-2.5 sm:px-3.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#2D3E10] transition-all hover:bg-primary hover:text-white active:scale-95 shadow-md"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">Buka Tab Baru</span>
              <span className="sm:hidden text-[10px]">Full</span>
            </button>
          ) : (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              title="Buka Peta Ukuran Penuh di Tab Baru"
              className="flex h-7 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-xl sm:rounded-2xl border border-white/60 bg-white/95 backdrop-blur-md px-2.5 sm:px-3.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#2D3E10] transition-all hover:bg-primary hover:text-white active:scale-95 shadow-md"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span className="hidden sm:inline">Buka Tab Baru</span>
              <span className="sm:hidden text-[10px]">Full</span>
            </a>
          )}
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative flex-1 w-full h-[55dvh] sm:h-[68dvh] max-h-[75vh] overflow-hidden flex items-center justify-center ${
          isDragging ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-zoom-in"
        }`}
        style={{ touchAction: "none" }}
      >
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

        {/* Loading Spinner */}
        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <span className="text-xs font-bold">Memuat Peta Kavling...</span>
          </div>
        )}

        {/* Scaled & Translated Map Image */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          draggable={false}
          className={`max-w-full max-h-full object-contain select-none ${
            isDragging ? "transition-none" : "transition-transform duration-200 ease-out"
          }`}
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            willChange: "transform",
          }}
        />
      </div>

      {/* Bottom Floating UX Hint */}
      <div className="absolute bottom-2 inset-x-2 sm:bottom-3 sm:inset-x-4 z-20 pointer-events-none flex items-center justify-center">
        <div className="flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white/90 text-[10px] sm:text-[11px] font-medium shadow-md">
          <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400 shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <span className="truncate">
            {scale > 1
              ? "Drag / geser peta • Double click reset"
              : "Pinch / scroll zoom • Drag menggeser"}
          </span>
        </div>
      </div>
    </div>
  );
}

