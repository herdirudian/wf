"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { formatDateWIB } from "@/lib/time";

interface StayDatePickerProps {
  checkIn: string;
  checkOut: string;
  minDate?: string;
  activeTarget: "checkIn" | "checkOut";
  onChangeActiveTarget: (target: "checkIn" | "checkOut") => void;
  onSelectCheckIn: (date: string) => void;
  onSelectCheckOut: (date: string) => void;
  onClose: () => void;
}

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function StayDatePicker({
  checkIn,
  checkOut,
  minDate,
  activeTarget,
  onChangeActiveTarget,
  onSelectCheckIn,
  onSelectCheckOut,
  onClose,
}: StayDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Initialize view month & year based on checkIn, or today
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (checkIn) {
      const parts = checkIn.split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        return new Date(parts[0], parts[1] - 1, 1);
      }
    }
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const todayStr = useMemo(() => formatDateWIB(new Date()), []);
  const effectiveMinDate = minDate || todayStr;

  // Listen to escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Check if we can navigate to previous month
  const canGoPrev = useMemo(() => {
    if (!effectiveMinDate) return true;
    const parts = effectiveMinDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return true;
    const minMonthDate = new Date(parts[0], parts[1] - 1, 1);
    return viewDate > minMonthDate;
  }, [viewDate, effectiveMinDate]);

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Generate calendar days for a given month and year
  const getMonthDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isPast: boolean;
      isToday: boolean;
    }> = [];

    // Leading empty slots for previous month padding
    for (let i = 0; i < firstDay; i++) {
      days.push({
        day: 0,
        dateStr: "",
        isCurrentMonth: false,
        isPast: true,
        isToday: false,
      });
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isPast = effectiveMinDate ? dateStr < effectiveMinDate : false;
      const isToday = dateStr === todayStr;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        isPast,
        isToday,
      });
    }

    return days;
  };

  const month1Year = viewDate.getFullYear();
  const month1Month = viewDate.getMonth();
  const month1Days = useMemo(() => getMonthDays(month1Year, month1Month), [month1Year, month1Month, effectiveMinDate, todayStr]);

  // Month 2 (Next month for desktop 2-column view)
  const nextMonthDate = useMemo(() => new Date(month1Year, month1Month + 1, 1), [month1Year, month1Month]);
  const month2Year = nextMonthDate.getFullYear();
  const month2Month = nextMonthDate.getMonth();
  const month2Days = useMemo(() => getMonthDays(month2Year, month2Month), [month2Year, month2Month, effectiveMinDate, todayStr]);

  // Handle day click
  const handleDayClick = (dateStr: string) => {
    if (!dateStr) return;

    if (activeTarget === "checkIn") {
      onSelectCheckIn(dateStr);
      // Auto move target to checkOut
      onChangeActiveTarget("checkOut");
    } else {
      // activeTarget === "checkOut"
      if (checkIn && dateStr <= checkIn) {
        // If user picked a date on or before check-in, set that as the new check-in date
        onSelectCheckIn(dateStr);
        onChangeActiveTarget("checkOut");
      } else {
        onSelectCheckOut(dateStr);
      }
    }
  };

  // Helper to format date display
  const formatFriendly = (str: string) => {
    if (!str) return "Belum dipilih";
    const parts = str.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return str;
    return `${parts[2]} ${MONTH_NAMES[parts[1] - 1].slice(0, 3)} ${parts[0]}`;
  };

  const stayNights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const inParts = checkIn.split("-").map(Number);
    const outParts = checkOut.split("-").map(Number);
    if (inParts.length !== 3 || outParts.length !== 3) return 0;
    const d1 = Date.UTC(inParts[0], inParts[1] - 1, inParts[2]);
    const d2 = Date.UTC(outParts[0], outParts[1] - 1, outParts[2]);
    return Math.max(0, Math.round((d2 - d1) / (24 * 60 * 60 * 1000)));
  }, [checkIn, checkOut]);

  // Render month calendar grid
  const renderMonthGrid = (year: number, month: number, days: typeof month1Days) => (
    <div className="flex-1">
      <div className="mb-3 text-center">
        <h4 className="text-sm font-bold text-[#2D3E10] tracking-tight">
          {MONTH_NAMES[month]} {year}
        </h4>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={`text-[11px] font-bold tracking-wider py-1 ${
              i === 0 ? "text-amber-800/80" : "text-[#2D3E10]/50"
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((item, idx) => {
          if (!item.isCurrentMonth) {
            return <div key={`empty-${idx}`} className="h-9 w-full" />;
          }

          const { dateStr, day, isPast, isToday } = item;
          const isCheckIn = dateStr === checkIn;
          const isCheckOut = dateStr === checkOut;
          const isInRange = checkIn && checkOut && dateStr > checkIn && dateStr < checkOut;
          const isHoverRange =
            activeTarget === "checkOut" &&
            checkIn &&
            hoverDate &&
            hoverDate > checkIn &&
            dateStr > checkIn &&
            dateStr <= hoverDate;

          let bgClasses = "text-[#2D3E10] hover:bg-[#2D3E10]/10";
          let roundedClasses = "rounded-xl";

          if (isCheckIn && isCheckOut) {
            bgClasses = "bg-[#2D3E10] text-white font-bold shadow-md shadow-[#2D3E10]/20";
            roundedClasses = "rounded-xl";
          } else if (isCheckIn) {
            bgClasses = "bg-[#2D3E10] text-white font-bold shadow-md shadow-[#2D3E10]/20";
            roundedClasses = checkOut ? "rounded-l-xl rounded-r-none" : "rounded-xl";
          } else if (isCheckOut) {
            bgClasses = "bg-[#2D3E10] text-white font-bold shadow-md shadow-[#2D3E10]/20";
            roundedClasses = "rounded-r-xl rounded-l-none";
          } else if (isInRange) {
            bgClasses = "bg-[#2D3E10]/10 text-[#2D3E10] font-semibold";
            roundedClasses = "rounded-none";
          } else if (isHoverRange) {
            bgClasses = "bg-[#2D3E10]/15 text-[#2D3E10]";
            roundedClasses = dateStr === hoverDate ? "rounded-r-xl rounded-l-none" : "rounded-none";
          }

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              onClick={() => handleDayClick(dateStr)}
              onMouseEnter={() => {
                if (!isPast && activeTarget === "checkOut") setHoverDate(dateStr);
              }}
              onMouseLeave={() => setHoverDate(null)}
              className={`relative flex h-9 sm:h-10 w-full items-center justify-center text-xs sm:text-[13px] font-medium transition-all ${roundedClasses} ${bgClasses} ${
                isPast
                  ? "cursor-not-allowed opacity-25 text-neutral-400 hover:bg-transparent"
                  : "cursor-pointer active:scale-95"
              }`}
              aria-label={`${day} ${MONTH_NAMES[month]} ${year}`}
            >
              <span className="relative z-10 tabular-nums">{day}</span>
              {isToday && !isCheckIn && !isCheckOut && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#2D3E10]/60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl border border-[#2D3E10]/15 bg-[#FAFBF7] p-4 sm:p-6 shadow-xl shadow-[#2D3E10]/5 transition-all"
    >
      {/* Header Controls: Mode Indicator & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E8E1] pb-4">
        {/* Selection mode toggle tabs */}
        <div className="flex items-center gap-1.5 rounded-xl bg-white p-1 border border-[#E8E8E1] shadow-xs">
          <button
            type="button"
            onClick={() => onChangeActiveTarget("checkIn")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTarget === "checkIn"
                ? "bg-[#2D3E10] text-white shadow-xs"
                : "text-[#2D3E10]/70 hover:text-[#2D3E10] hover:bg-[#2D3E10]/5"
            }`}
          >
            <span>Check-in:</span>
            <span className="font-semibold">{formatFriendly(checkIn)}</span>
          </button>

          <span className="text-[#E8E8E1] text-xs">→</span>

          <button
            type="button"
            onClick={() => onChangeActiveTarget("checkOut")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTarget === "checkOut"
                ? "bg-[#2D3E10] text-white shadow-xs"
                : "text-[#2D3E10]/70 hover:text-[#2D3E10] hover:bg-[#2D3E10]/5"
            }`}
          >
            <span>Check-out:</span>
            <span className="font-semibold">{formatFriendly(checkOut)}</span>
          </button>
        </div>

        {/* Month Navigation & Close */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={!canGoPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E8E1] bg-white text-[#2D3E10] shadow-2xs transition-all hover:bg-[#2D3E10]/10 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Bulan sebelumnya"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E8E1] bg-white text-[#2D3E10] shadow-2xs transition-all hover:bg-[#2D3E10]/10"
            aria-label="Bulan berikutnya"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8E8E1] bg-white text-[#2D3E10]/60 shadow-2xs transition-all hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
            aria-label="Tutup kalender"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Helper Guidance Banner */}
      <div className="mt-3 flex items-center gap-2 text-xs text-[#2D3E10]/80">
        <span className="flex h-2 w-2 rounded-full bg-[#2D3E10] animate-pulse" />
        <span className="font-semibold">
          {activeTarget === "checkIn"
            ? "Pilih tanggal mulai menginap (Check-in)"
            : "Pilih tanggal kepulangan (Check-out)"}
        </span>
      </div>

      {/* Calendar Months Display (1 Month on Mobile, 2 Months on Desktop) */}
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:gap-8">
        {renderMonthGrid(month1Year, month1Month, month1Days)}
        <div className="hidden sm:block sm:flex-1 border-l border-[#E8E8E1] sm:pl-8">
          {renderMonthGrid(month2Year, month2Month, month2Days)}
        </div>
      </div>

      {/* Footer Summary & Done Button */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E8E1] pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#2D3E10]">
          {stayNights > 0 ? (
            <span className="rounded-full bg-[#2D3E10]/10 px-3 py-1 font-bold text-[#2D3E10]">
              🌙 {stayNights} Malam Menginap
            </span>
          ) : (
            <span className="text-[#2D3E10]/60 font-medium">Minimal pemesanan 1 malam</span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-[#2D3E10] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] active:scale-98"
        >
          Selesai Memilih
        </button>
      </div>
    </div>
  );
}
