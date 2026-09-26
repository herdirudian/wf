"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR, formatTimeWIB } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";
import { buildKavlingBlockMap, resolveKavlingBlockName, KavlingBlockConfig } from "@/lib/kavling-config";
import { ImageCarousel } from "@/components/ui/ImageCarousel";
import { Modal } from "@/components/ui/Modal";
import { InteractiveMapViewer } from "@/components/ui/InteractiveMapViewer";

type AvailabilityUnit = {
  id: string;
  name: string;
  type: string;
  category?: string | null;
  kavlingScope?: string | null;
  autoAddOnId?: string | null;
  autoAddOnMode?: string | null;
  capacity: number;
  totalUnits: number;
  priceWeekday: number;
  priceWeekend: number;
  description?: string | null;
  includesJson?: string | null;
  imagesJson?: string | null;
  facilitiesJson?: string | null;
  daily?: Array<{ date: string; price: number; allotment: number; booked: number; available: number }>;
  available: number;
};

type AvailabilityAddOn = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type BookingDraft = {
  customer: { name: string; phone: string; email: string };
  specialRequest?: string | null;
  checkIn: string;
  checkOut: string;
  totalGuest: number;
  adultPax: number;
  child5to10Pax: number;
  childUnder5Pax: number;
  kavlingScope: "" | "paket" | "mandiri" | "private" | "mixed";
  kavlings: (string | number)[];
  hold?: { id: string; token: string; expiresAt?: string };
  items: Array<{ unitId: string; quantity: number }>;
  addOns: Array<{ addOnId: string; quantity: number }>;
  display: {
    items: Array<{ unitId: string; name: string; quantity: number }>;
    addOns: Array<{ addOnId: string; name: string; price: number; quantity: number }>;
  };
  amountEstimate: number;
  createdAt: string;
};

type PublicBookingInvoice = {
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalGuest: number;
  specialRequest: string | null;
  customer: { name: string; phone: string; email: string };
  items: Array<{ name: string; quantity: number }>;
  addOns: Array<{ name: string; quantity: number; price: number }>;
  kavlings: number[];
  payment: { amount: number; paidAmount: number; paidAt: string | null; method: string | null; checkoutUrl: string | null };
};

function readDraft() {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem("wf_booking_draft");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BookingDraft;
  } catch {
    return null;
  }
}

function draftHoldCredsFor(params: { checkIn: string; checkOut: string }) {
  const d = readDraft();
  if (!d?.hold?.id || !d?.hold?.token) return null;
  if (d.checkIn !== params.checkIn || d.checkOut !== params.checkOut) return null;
  
  // Verify expiration
  if (d.hold.expiresAt) {
    const expiresMs = new Date(d.hold.expiresAt).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      return null;
    }
  }

  return { id: d.hold.id, token: d.hold.token, expiresAt: d.hold.expiresAt ?? new Date(0).toISOString() };
}

function isoDate(d: Date) {
  return formatDateWIB(d);
}

function formatStayDate(str: string) {
  if (!str) return { dayName: "Pilih tanggal", formattedDate: "Belum dipilih" };
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return { dayName: "-", formattedDate: str };
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return {
    dayName: dayNames[d.getDay()],
    formattedDate: `${parts[2]} ${monthNames[parts[1] - 1]} ${parts[0]}`,
  };
}

function calculateStayNights(inStr: string, outStr: string) {
  if (!inStr || !outStr) return 0;
  const inParts = inStr.split("-").map(Number);
  const outParts = outStr.split("-").map(Number);
  if (inParts.length !== 3 || outParts.length !== 3) return 0;
  const d1 = Date.UTC(inParts[0], inParts[1] - 1, inParts[2]);
  const d2 = Date.UTC(outParts[0], outParts[1] - 1, outParts[2]);
  const diff = Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

function sumDailyPrice(u: AvailabilityUnit) {
  const daily = u.daily ?? [];
  if (!daily.length) return 0;
  return daily.reduce((acc, x) => acc + x.price, 0);
}

function priceRangeLabel(u: AvailabilityUnit) {
  const daily = u.daily ?? [];
  if (!daily.length) return "-";
  const prices = daily.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatIDR(min) : `${formatIDR(min)} - ${formatIDR(max)}`;
}

function parseIncludesJson(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function parseImagesJson(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function parseFacilitiesJson(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

const FACILITY_LABEL_BY_KEY: Record<string, string> = {
  wifi: "WiFi",
  air_panas: "Air panas",
  kids_friendly: "Kids friendly",
  breakfast: "Breakfast",
  parkir: "Parkir",
  listrik: "Listrik",
};

function deriveCategory(u: AvailabilityUnit) {
  const raw = (u.category ?? "").toLowerCase();
  if (raw === "paket" || raw === "mandiri" || raw === "unit") return raw;
  const n = u.name.toLowerCase();
  if (n.startsWith("paket ")) return "paket";
  if (n.includes("mandiri") || n.includes("kavling")) return "mandiri";
  return "unit";
}

function kavlingGroupFromText(input: string) {
  const t = input.toLowerCase();
  if (t.includes("private")) return "private";
  if (t.includes("mandiri") || t.includes("kavling")) return "mandiri";
  if (t.includes("paket")) return "paket";
  return null;
}

function kavlingGroupFromUnit(u: AvailabilityUnit) {
  const raw = (u.kavlingScope ?? "").toLowerCase();
  if (raw === "paket" || raw === "mandiri" || raw === "private") return raw;
  return kavlingGroupFromText((u.category ?? u.name).toString());
}

function extractBlockName(item: string | number, blockMap?: Map<string, string>): string {
  return resolveKavlingBlockName(item, blockMap);
}

function QuantityStepper({
  value,
  min = 0,
  max,
  size = "md",
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const decDisabled = disabled || value <= min;
  const incDisabled = disabled || (typeof max === "number" ? value >= max : false);

  const btnClass = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const midClass = size === "sm" ? "min-w-[28px] text-xs" : "min-w-[36px] text-sm";

  return (
    <div className="inline-flex w-fit items-center gap-1 p-1 rounded-xl border border-white/10 bg-[#162415] shadow-inner">
      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnClass} flex items-center justify-center rounded-lg bg-[#121C11] text-[#F6F5F0] border border-white/10 transition-all hover:text-[#86A86C] hover:border-[#86A86C]/40 active:scale-95 disabled:opacity-20 disabled:pointer-events-none`}
        aria-label={`Kurangi ${ariaLabel}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
      <div className={`${midClass} flex items-center justify-center text-center font-mono tabular-nums font-bold text-[#F6F5F0]`} aria-label={ariaLabel}>
        {value}
      </div>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        className={`${btnClass} flex items-center justify-center rounded-lg bg-[#121C11] text-[#F6F5F0] border border-white/10 transition-all hover:text-[#86A86C] hover:border-[#86A86C]/40 active:scale-95 disabled:opacity-20 disabled:pointer-events-none`}
        aria-label={`Tambah ${ariaLabel}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

export default function PublicBookingPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Use stable initial values for SSR to prevent hydration mismatch
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [unitPage, setUnitPage] = useState(1);
  const [minDate, setMinDate] = useState("");

  const [currentStep, setCurrentStep] = useState(1);
  const [adultPax, setAdultPax] = useState(1);
  const [child5to10Pax, setChild5to10Pax] = useState(0);
  const [childUnder5Pax, setChildUnder5Pax] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [totalGuest, setTotalGuest] = useState(1);
  const [specialRequest, setSpecialRequest] = useState("");

  const [kavlingTab, setKavlingTab] = useState<"grid" | "map">("grid");
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setMinDate(isoDate(new Date()));
  }, []);

  useEffect(() => {
    setTotalGuest(adultPax + child5to10Pax + childUnder5Pax);
  }, [adultPax, child5to10Pax, childUnder5Pax]);

  type QtyById = Record<string, number>;

  const [units, setUnits] = useState<AvailabilityUnit[]>([]);
  const [addons, setAddons] = useState<AvailabilityAddOn[]>([]);
  const [unitQty, setUnitQty] = useState<QtyById>({});
  const [addonQty, setAddonQty] = useState<QtyById>({});
  const [showAllAddons, setShowAllAddons] = useState(false);

  const [kavlingAll, setKavlingAll] = useState<(string | number)[]>([]);
  const [kavlingTaken, setKavlingTaken] = useState<(string | number)[]>([]);
  const [kavlingPaid, setKavlingPaid] = useState<(string | number)[]>([]);
  const [kavlingHeld, setKavlingHeld] = useState<(string | number)[]>([]);
  const [kavlingOOO, setKavlingOOO] = useState<(string | number)[]>([]);
  const [kavlingSelected, setKavlingSelected] = useState<(string | number)[]>([]);
  const [selectedBlockFilter, setSelectedBlockFilter] = useState<string>("ALL");
  const [kavlingBlocksConfig, setKavlingBlocksConfig] = useState<KavlingBlockConfig[]>([]);
  const kavlingBlockMap = useMemo(() => buildKavlingBlockMap(kavlingBlocksConfig), [kavlingBlocksConfig]);
  const [kavlingLoading, setKavlingLoading] = useState(false);
  const [kavlingError, setKavlingError] = useState<string | null>(null);
  const [kavlingPrivateRange, setKavlingPrivateRange] = useState<null | { start: string | number; end: string | number }>(null);
  const [kavlingSellCount, setKavlingSellCount] = useState<number | null>(null);
  const [hold, setHold] = useState<null | { id: string; token: string; expiresAt: string }>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdHeartbeat, setHoldHeartbeat] = useState(0);

  const availableBlocks = useMemo(() => {
    const blocksMap = new Map<string, number>();
    for (const n of kavlingAll) {
      const bName = extractBlockName(n, kavlingBlockMap);
      blocksMap.set(bName, (blocksMap.get(bName) || 0) + 1);
    }
    const configOrder = kavlingBlocksConfig.map((b) => b.name);
    const sortedBlockNames = Array.from(blocksMap.keys()).sort((a, b) => {
      const idxA = configOrder.indexOf(a);
      const idxB = configOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      if (a === "Lainnya") return 1;
      if (b === "Lainnya") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    return sortedBlockNames.map((name) => ({
      name,
      count: blocksMap.get(name) || 0,
    }));
  }, [kavlingAll, kavlingBlockMap, kavlingBlocksConfig]);

  const filteredKavlingAll = useMemo(() => {
    if (selectedBlockFilter === "ALL") return kavlingAll;
    return kavlingAll.filter((n) => extractBlockName(n, kavlingBlockMap) === selectedBlockFilter);
  }, [kavlingAll, selectedBlockFilter, kavlingBlockMap]);

  useEffect(() => {
    if (selectedBlockFilter !== "ALL" && !availableBlocks.some((b) => b.name === selectedBlockFilter)) {
      setSelectedBlockFilter("ALL");
    }
  }, [availableBlocks, selectedBlockFilter]);

  // Real-time kavling updates
  useEffect(() => {
    const es = new EventSource("/api/public/kavlings/realtime");
    es.onmessage = () => {
      setHoldHeartbeat((x) => x + 1);
    };
    es.onerror = () => {
      es.close();
      // Retry after 5s if connection lost
      setTimeout(() => setHoldHeartbeat((x) => x + 1), 5000);
    };
    return () => es.close();
  }, []);

  const [kavlingMapOpen, setKavlingMapOpen] = useState(false);
  const [kavlingMapAssetVersion, setKavlingMapAssetVersion] = useState(0);
  const [holdNow, setHoldNow] = useState(0);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; amount: number } | null>(null);
  const [invoice, setInvoice] = useState<PublicBookingInvoice | null>(null);
  const [packageConfigs, setPackageConfigs] = useState<Record<string, { description?: string; imageUrl?: string }>>({});
  const preserveHoldOnUnmountRef = useRef(false);
  const restoringDraftRef = useRef(false);
  const pendingKavlingRestoreRef = useRef<null | { scope: "" | "paket" | "mandiri" | "private" | "mixed"; kavlings: (string | number)[]; hold?: { id: string; token: string; expiresAt?: string } }>(null);

  const resetSelection = useCallback((keepDraftRef = false) => {
    setUnitQty({});
    setAddonQty({});
    setKavlingSelected([]);
    if (hold?.id && hold?.token) void releaseHold(hold);
    setHold(null);
    setHoldError(null);
    if (!keepDraftRef) {
      restoringDraftRef.current = false;
      pendingKavlingRestoreRef.current = null;
    }
  }, [hold]);

  const checkInInputRef = useRef<HTMLInputElement>(null);
  const checkOutInputRef = useRef<HTMLInputElement>(null);

  const openCheckInPicker = useCallback(() => {
    if (checkInInputRef.current) {
      try {
        checkInInputRef.current.showPicker?.();
      } catch {
        checkInInputRef.current.focus();
      }
    }
  }, []);

  const openCheckOutPicker = useCallback(() => {
    if (checkOutInputRef.current) {
      try {
        checkOutInputRef.current.showPicker?.();
      } catch {
        checkOutInputRef.current.focus();
      }
    }
  }, []);

  const handleCheckInChange = useCallback((newVal: string) => {
    if (checkIn !== newVal) {
      resetSelection();
    }
    setCheckIn(newVal);
    if (newVal && checkOut && checkOut <= newVal) {
      const parts = newVal.split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const nextDay = new Date(parts[0], parts[1] - 1, parts[2] + 1);
        setCheckOut(isoDate(nextDay));
      }
    }
  }, [checkIn, checkOut, resetSelection]);

  const handleCheckOutChange = useCallback((newVal: string) => {
    if (checkOut !== newVal) {
      resetSelection();
    }
    setCheckOut(newVal);
  }, [checkOut, resetSelection]);

  useEffect(() => {
    // Only initialize dates and versions once mounted on the client
    const today = new Date();
    const defaultCheckIn = isoDate(today);
    const dOut = new Date(today);
    dOut.setDate(dOut.getDate() + 1);
    const defaultCheckOut = isoDate(dOut);

    setKavlingMapAssetVersion(Date.now());
    setHoldNow(Date.now());

    const draft = readDraft();
    if (draft) {
      restoringDraftRef.current = true;
      setCheckIn(draft.checkIn);
      setCheckOut(draft.checkOut);
      setName(draft.customer.name);
      setPhone(draft.customer.phone);
      setEmail(draft.customer.email);
      setAdultPax(draft.adultPax ?? 1);
      setChild5to10Pax(draft.child5to10Pax ?? 0);
      setChildUnder5Pax(draft.childUnder5Pax ?? 0);
      setTotalGuest(draft.totalGuest);
      setSpecialRequest(draft.specialRequest ?? "");
      
      setUnitQty(Object.fromEntries(draft.items.map((it) => [it.unitId, it.quantity])));
      setAddonQty(Object.fromEntries(draft.addOns.map((a) => [a.addOnId, a.quantity])));
      pendingKavlingRestoreRef.current = {
        scope: draft.kavlingScope ?? "",
        kavlings: draft.kavlings ?? [],
        hold: draft.hold,
      };
    } else {
      setCheckIn((prev) => prev || defaultCheckIn);
      setCheckOut((prev) => prev || defaultCheckOut);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    if (stepParam) {
      const s = parseInt(stepParam);
      if (s >= 1 && s <= 3) setCurrentStep(s);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const code = params.get("code");
    if (code) {
      if (paid === "1") {
        setSubmitting(false);
        const draft = readDraft();
        setSuccess({ code, amount: draft?.amountEstimate ?? 0 });

        fetch(`/api/public/bookings/${encodeURIComponent(code)}`)
          .then((res) => res.json())
          .then((data: PublicBookingInvoice) => {
            if (data?.code === code) {
              setInvoice(data);
              setSuccess({ code: data.code, amount: Number(data.payment?.amount ?? 0) });
            }
          })
          .catch(() => null);
      }
    }
  }, []);
  
  useEffect(() => {
    fetch("/api/packages")
      .then((res) => res.json())
      .then((data) => setPackageConfigs(data))
      .catch(() => null);
  }, []);

  async function releaseHold(h: { id: string; token: string }) {
    await fetch("/api/public/kavlings/hold/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdId: h.id, holdToken: h.token }),
      keepalive: true,
    }).catch(() => null);
  }

  useEffect(() => {
    if (!hold?.id || !hold?.token) return;
    const holdId = hold.id;
    const holdToken = hold.token;
    function onBeforeUnload() {
      const body = JSON.stringify({ holdId, holdToken });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/public/kavlings/hold/release", new Blob([body], { type: "application/json" }));
        return;
      }
      void releaseHold({ id: holdId, token: holdToken });
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (!preserveHoldOnUnmountRef.current) void releaseHold({ id: holdId, token: holdToken });
    };
  }, [hold?.id, hold?.token]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) if (u.type) set.add(u.type);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) if (u.category) set.add(u.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);

  const selectedKavlingGroup = useMemo(() => {
    if (!filterCategory) return null;
    const inCat = units.filter((u) => (u.category ?? "") === filterCategory);
    const scopes = new Set<string>();
    for (const u of inCat) {
      const g = kavlingGroupFromUnit(u);
      if (g) scopes.add(g);
    }
    return scopes.size === 1 ? Array.from(scopes)[0] : null;
  }, [filterCategory, units]);

  const kavlingQtyByGroup = useMemo(() => {
    let mandiri = 0;
    let paket = 0;
    let privatePaket = 0;
    for (const u of units) {
      const qty = unitQty[u.id] ?? 0;
      if (!qty) continue;
      const g = kavlingGroupFromUnit(u);
      if (g === "mandiri") mandiri += qty;
      else if (g === "private") privatePaket += qty;
      else if (g === "paket") paket += qty;
    }
    return { mandiri, paket, private: privatePaket };
  }, [units, unitQty]);

  const activeKavlingGroup = useMemo(() => {
    if (selectedKavlingGroup) return selectedKavlingGroup;
    const nonZero = [
      { key: "mandiri", qty: kavlingQtyByGroup.mandiri },
      { key: "private", qty: kavlingQtyByGroup.private },
      { key: "paket", qty: kavlingQtyByGroup.paket },
    ].filter((x) => x.qty > 0);
    if (nonZero.length === 1) return nonZero[0].key as "mandiri" | "paket" | "private";
    return null;
  }, [kavlingQtyByGroup.mandiri, kavlingQtyByGroup.paket, kavlingQtyByGroup.private, selectedKavlingGroup]);

  const kavlingAmbiguous = useMemo(
    () =>
      !selectedKavlingGroup &&
      [
        kavlingQtyByGroup.mandiri > 0,
        kavlingQtyByGroup.private > 0,
        kavlingQtyByGroup.paket > 0,
      ].filter(Boolean).length > 1,
    [kavlingQtyByGroup.mandiri, kavlingQtyByGroup.paket, kavlingQtyByGroup.private, selectedKavlingGroup],
  );

  const combinedNonPrivate = useMemo(
    () => !selectedKavlingGroup && kavlingQtyByGroup.private === 0 && kavlingQtyByGroup.mandiri > 0 && kavlingQtyByGroup.paket > 0,
    [kavlingQtyByGroup.mandiri, kavlingQtyByGroup.paket, kavlingQtyByGroup.private, selectedKavlingGroup],
  );

  const combinedAll = useMemo(
    () => !selectedKavlingGroup && kavlingQtyByGroup.private > 0 && (kavlingQtyByGroup.mandiri > 0 || kavlingQtyByGroup.paket > 0),
    [kavlingQtyByGroup.mandiri, kavlingQtyByGroup.paket, kavlingQtyByGroup.private, selectedKavlingGroup],
  );

  const [kavlingScopePick, setKavlingScopePick] = useState<"" | "paket" | "private" | "mandiri" | "mixed">("");
  const effectiveKavlingScope = useMemo(() => {
    if (kavlingScopePick) return kavlingScopePick;
    if (combinedAll) return "mixed";
    if (combinedNonPrivate) return "paket";
    return kavlingAmbiguous ? null : activeKavlingGroup;
  }, [activeKavlingGroup, combinedAll, combinedNonPrivate, kavlingAmbiguous, kavlingScopePick]);

  useEffect(() => {
    const pending = pendingKavlingRestoreRef.current;
    if (!pending) return;
    if (!effectiveKavlingScope) return;
    if (pending.scope && !kavlingScopePick && pending.scope !== effectiveKavlingScope) {
      setKavlingScopePick(pending.scope);
      return;
    }

    if (pending.kavlings?.length) setKavlingSelected(pending.kavlings);
    if (pending.hold?.id && pending.hold?.token) {
      setHold({ id: pending.hold.id, token: pending.hold.token, expiresAt: pending.hold.expiresAt ?? new Date(0).toISOString() });
    }
    pendingKavlingRestoreRef.current = null;
    restoringDraftRef.current = false;
  }, [effectiveKavlingScope, kavlingScopePick]);

  const prevKavlingAmbiguousRef = useRef(false);
  useEffect(() => {
    const prev = prevKavlingAmbiguousRef.current;
    prevKavlingAmbiguousRef.current = kavlingAmbiguous;
    if (restoringDraftRef.current && pendingKavlingRestoreRef.current) return;
    if (!kavlingAmbiguous || combinedNonPrivate || combinedAll || prev) return;
    if (!kavlingSelected.length && !hold?.id) return;
    if (hold?.id && hold?.token) void releaseHold(hold);
    setHold(null);
    setHoldSubmitting(false);
    setKavlingSelected([]);
    setKavlingScopePick("");
    setHoldError("Kavling direset karena kamu memilih item dari beberapa grup. Pilih salah satu grup untuk lanjut pilih kavling.");
    setHoldHeartbeat((x) => x + 1);
  }, [hold?.id, hold?.token, combinedAll, kavlingAmbiguous, kavlingSelected.length]);

  useEffect(() => {
    if (!kavlingAmbiguous && kavlingScopePick) setKavlingScopePick("");
  }, [kavlingAmbiguous, kavlingScopePick]);

  useEffect(() => {
    setUnitPage(1);
  }, [checkIn, checkOut, filterType, filterCategory]);

  const requiredKavlings = useMemo(() => {
    if (combinedAll) return kavlingQtyByGroup.private + kavlingQtyByGroup.mandiri + kavlingQtyByGroup.paket;
    if (combinedNonPrivate) return kavlingQtyByGroup.mandiri + kavlingQtyByGroup.paket;
    const targetCat = effectiveKavlingScope ?? "";
    return units.reduce((acc, u) => {
      if (!targetCat) return acc;
      const g = kavlingGroupFromUnit(u);
      if (g !== targetCat) return acc;
      return acc + (unitQty[u.id] ?? 0);
    }, 0);
  }, [combinedAll, combinedNonPrivate, effectiveKavlingScope, kavlingQtyByGroup.mandiri, kavlingQtyByGroup.paket, kavlingQtyByGroup.private, units, unitQty]);

  useEffect(() => {
    if (!units.length) return;
    if (restoringDraftRef.current && pendingKavlingRestoreRef.current) return;
    setKavlingSelected((prev) => prev.slice(0, requiredKavlings));
  }, [requiredKavlings, units.length]);

  useEffect(() => {
    if (!effectiveKavlingScope) {
      if (restoringDraftRef.current && pendingKavlingRestoreRef.current) return;
      setKavlingAll([]);
      setKavlingTaken([]);
      setKavlingSelected([]);
      setKavlingLoading(false);
      setKavlingError(null);
      setKavlingPrivateRange(null);
      setKavlingSellCount(null);
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError(null);
      return;
    }

    // Auto-clear selection if scope changed and we're not restoring
    if (restoringDraftRef.current && pendingKavlingRestoreRef.current) return;
    
    const isMismatch = pendingKavlingRestoreRef.current && pendingKavlingRestoreRef.current.scope !== effectiveKavlingScope;
    if (isMismatch) {
      setKavlingSelected([]);
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
    }
    

    const scope = effectiveKavlingScope;
    let cancelled = false;
    async function load() {
      setKavlingLoading(true);
      setKavlingError(null);
      const url = new URL("/api/public/kavlings", window.location.origin);
      url.searchParams.set("checkIn", checkIn);
      url.searchParams.set("checkOut", checkOut);
      url.searchParams.set("scope", scope);
      const pending = restoringDraftRef.current ? pendingKavlingRestoreRef.current : null;
      const pendingHold = pending?.hold;
      const pendingExpiresMs = pendingHold?.expiresAt ? new Date(pendingHold.expiresAt).getTime() : NaN;
      const pendingHoldValid = !!pendingHold?.id && !!pendingHold?.token && (!pendingHold.expiresAt || (Number.isFinite(pendingExpiresMs) && pendingExpiresMs > Date.now()));
      const draftHold = !hold?.id || !hold?.token ? draftHoldCredsFor({ checkIn, checkOut }) : null;
      const holdId = hold?.id ?? (pendingHoldValid ? pendingHold!.id : undefined) ?? draftHold?.id;
      const holdToken = hold?.token ?? (pendingHoldValid ? pendingHold!.token : undefined) ?? draftHold?.token;
      if (holdId && holdToken) {
        url.searchParams.set("holdId", holdId);
        url.searchParams.set("holdToken", holdToken);
      }
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as
        | { all?: (string | number)[]; taken?: (string | number)[]; paid?: (string | number)[]; held?: (string | number)[]; ooo?: (string | number)[]; sellCount?: number; privateRange?: { start?: string | number; end?: string | number }; kavlingBlocks?: KavlingBlockConfig[]; myHold?: { id: string; token: string; expiresAt: string; numbers: string[] }; message?: string }
        | null;
      if (cancelled) return;
      if (!res.ok) {
        setKavlingAll([]);
        setKavlingTaken([]);
        setKavlingPaid([]);
        setKavlingHeld([]);
        setKavlingOOO([]);
        setKavlingLoading(false);
        setKavlingError(data?.message ?? "Gagal load kavling");
        return;
      }
      setKavlingAll((data?.all ?? []).filter((n): n is string | number => typeof n === "number" || (typeof n === "string" && Boolean(n.trim()))));
      setKavlingTaken((data?.taken ?? []).filter((n): n is string | number => typeof n === "number" || (typeof n === "string" && Boolean(n.trim()))));
      setKavlingPaid((data?.paid ?? []).filter((n): n is string | number => typeof n === "number" || (typeof n === "string" && Boolean(n.trim()))));
      setKavlingHeld((data?.held ?? []).filter((n): n is string | number => typeof n === "number" || (typeof n === "string" && Boolean(n.trim()))));
      setKavlingOOO((data?.ooo ?? []).filter((n): n is string | number => typeof n === "number" || (typeof n === "string" && Boolean(n.trim()))));
      if (Array.isArray(data?.kavlingBlocks)) setKavlingBlocksConfig(data.kavlingBlocks);

      // Auto-restore selection from server-side hold if local selection is empty
      if (data?.myHold && data.myHold.numbers.length > 0 && kavlingSelected.length === 0) {
        setKavlingSelected(data.myHold.numbers);
        setHold({ id: data.myHold.id, token: data.myHold.token, expiresAt: data.myHold.expiresAt });
      }

      if (typeof data?.sellCount === "number" && Number.isFinite(data.sellCount)) setKavlingSellCount(data.sellCount);
      const ps = data?.privateRange?.start;
      const pe = data?.privateRange?.end;
      if (typeof ps === "number" && typeof pe === "number") setKavlingPrivateRange({ start: ps, end: pe });
      setKavlingLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveKavlingScope, checkIn, checkOut, hold?.id, hold?.token, holdHeartbeat]);

  useEffect(() => {
    if (!effectiveKavlingScope) return;
    if (!units.length) return;
    if (submitting) return;
    if (restoringDraftRef.current && pendingKavlingRestoreRef.current) return;

    if (!hold?.id || !hold?.token) {
      if (requiredKavlings > 0) {
        const dHold = draftHoldCredsFor({ checkIn, checkOut });
        if (dHold?.id && dHold?.token) {
          setHold(dHold);
          return;
        }
      }
    }

    if (!requiredKavlings) {
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError(null);
      return;
    }
    
    // During restoration or change, don't clear hold immediately if lengths don't match.
    // Let the user adjust their selection. Only release if they explicitly want to or if we need a new hold.
    if (kavlingSelected.length !== requiredKavlings) {
      // if (hold?.id && hold?.token) void releaseHold(hold);
      // setHold(null);
      // setHoldError(null);
      return;
    }
    // Check for actual conflicts with other users/bookings
    // We ignore conflicts if they are with our own current hold (handled by backend excludeHoldId)
    const trulyTaken = kavlingTaken.filter(n => !kavlingSelected.includes(n));
    
    if (kavlingSelected.some((n) => kavlingTaken.includes(n))) {
      // Before erroring, we wait a bit to see if a refresh clears it (might be a sync issue)
      // or we just trust the backend POST to give the final verdict.
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setHoldSubmitting(true);
      setHoldError(null);
      const dHold = !hold?.id || !hold?.token ? draftHoldCredsFor({ checkIn, checkOut }) : null;
      const holdId = hold?.id ?? dHold?.id;
      const holdToken = hold?.token ?? dHold?.token;
      const res = await fetch("/api/public/kavlings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkIn,
          checkOut,
          scope: effectiveKavlingScope,
          numbers: kavlingSelected,
          holdId,
          holdToken,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { holdId?: string; holdToken?: string; expiresAt?: string; message?: string }
        | null;
      if (cancelled) return;
      if (!res.ok) {
        setHoldSubmitting(false);
        setHold(null);
        setHoldError(data?.message ?? "Gagal hold kavling");
        setHoldHeartbeat((x) => x + 1);
        
        // If the server says it's already held, and we were trying to use a draft hold,
        // it might be a stale/sync issue. Clear the draft so next attempt starts fresh.
        if (res.status === 400 && data?.message?.includes("sedang di-hold")) {
          const d = readDraft();
          if (d) {
            delete d.hold;
            window.sessionStorage.setItem("wf_booking_draft", JSON.stringify(d));
          }
        }
        return;
      }
      if (data?.holdId && data?.holdToken && data?.expiresAt) {
        setHold({ id: data.holdId, token: data.holdToken, expiresAt: data.expiresAt });
      }
      setHoldSubmitting(false);
      setHoldHeartbeat((x) => x + 1);
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [effectiveKavlingScope, checkIn, checkOut, hold?.id, hold?.token, kavlingSelected, kavlingTaken, requiredKavlings, submitting]);

  useEffect(() => {
    if (!hold?.expiresAt) return;
    const expiresMs = new Date(hold.expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return;
    const interval = setInterval(() => {
      const left = expiresMs - Date.now();
      if (left <= 90_000) setHoldHeartbeat((x) => x + 1);
    }, 30_000);
    return () => clearInterval(interval);
  }, [hold?.expiresAt]);

  const holdLeftMs = useMemo(() => {
    if (!hold?.expiresAt) return null;
    const expiresMs = new Date(hold.expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return null;
    return Math.max(0, expiresMs - holdNow);
  }, [hold?.expiresAt, holdNow]);

  const holdLeftLabel = useMemo(() => {
    if (holdLeftMs === null) return null;
    const totalSec = Math.floor(holdLeftMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [holdLeftMs]);

  useEffect(() => {
    if (holdLeftMs !== null && holdLeftMs <= 0 && hold) {
      setHold(null);
      setHoldError("Sesi pemilihan kavling telah berakhir. Silakan pilih ulang.");
      setKavlingSelected([]);
    }
  }, [holdLeftMs, hold]);

  useEffect(() => {
    if (!hold?.expiresAt) return;
    const t = window.setInterval(() => setHoldNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hold?.expiresAt]);

  const holdRefreshInFlightRef = useRef(false);
  const holdRefreshFailCountRef = useRef(0);
  useEffect(() => {
    if (!effectiveKavlingScope) return;
    if (!hold?.id || !hold?.token) return;
    if (!hold?.expiresAt) return;
    const scope = effectiveKavlingScope;
    const holdId = hold.id;
    const holdToken = hold.token;
    if (!requiredKavlings) return;
    if (kavlingSelected.length !== requiredKavlings) return;
    if (submitting) return;

    let stopped = false;
    let t: number | null = null;
    const expiresMs = new Date(hold.expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return;

    async function refreshHold(silent: boolean) {
      if (holdRefreshInFlightRef.current) return;
      holdRefreshInFlightRef.current = true;
      try {
        const res = await fetch("/api/public/kavlings/hold", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            checkIn,
            checkOut,
            scope,
            numbers: kavlingSelected,
            holdId,
            holdToken,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { holdId?: string; holdToken?: string; expiresAt?: string; message?: string }
          | null;
        if (!res.ok) throw new Error(data?.message ?? "Gagal refresh hold");
        if (data?.holdId && data?.holdToken && data?.expiresAt) {
          setHold({ id: data.holdId, token: data.holdToken, expiresAt: data.expiresAt });
          holdRefreshFailCountRef.current = 0;
          if (!silent) setHoldHeartbeat((x) => x + 1);
        }
      } catch (e) {
        holdRefreshFailCountRef.current += 1;
        if (!silent) {
          setHoldError(e instanceof Error ? e.message : "Gagal refresh hold");
        }
        if (holdRefreshFailCountRef.current >= 2) {
          setHold(null);
          setHoldHeartbeat((x) => x + 1);
        }
      } finally {
        holdRefreshInFlightRef.current = false;
      }
    }

    function schedule() {
      if (stopped) return;
      const left = Math.max(0, expiresMs - Date.now());
      const base = left > 3 * 60_000 ? 60_000 : left > 90_000 ? 30_000 : left > 30_000 ? 15_000 : 8_000;
      const backoff = Math.min(120_000, holdRefreshFailCountRef.current * 10_000);
      const nextIn = Math.max(6_000, base + backoff);
      t = window.setTimeout(async () => {
        await refreshHold(true);
        schedule();
      }, nextIn);
    }

    schedule();

    function onVisibility() {
      if (document.visibilityState === "visible") void refreshHold(true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (t) window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    checkIn,
    checkOut,
    effectiveKavlingScope,
    hold?.expiresAt,
    hold?.id,
    hold?.token,
    kavlingSelected,
    requiredKavlings,
    submitting,
  ]);

  useEffect(() => {
    const d = readDraft();
    if (!d) return;
    if (d.checkIn !== checkIn || d.checkOut !== checkOut) return;
    const next: BookingDraft = {
      ...d,
      kavlingScope: (effectiveKavlingScope ?? d.kavlingScope) as BookingDraft["kavlingScope"],
      kavlings: effectiveKavlingScope ? kavlingSelected : d.kavlings,
      hold: hold?.id && hold?.token ? { id: hold.id, token: hold.token, expiresAt: hold.expiresAt } : undefined,
    };
    try {
      window.sessionStorage.setItem("wf_booking_draft", JSON.stringify(next));
    } catch {}
  }, [checkIn, checkOut, effectiveKavlingScope, hold?.expiresAt, hold?.id, hold?.token, kavlingSelected]);

  useEffect(() => {
    if (!checkIn || !checkOut) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const url = new URL("/api/public/availability", window.location.origin);
      url.searchParams.set("checkIn", checkIn);
      url.searchParams.set("checkOut", checkOut);
      if (filterType) url.searchParams.set("type", filterType);

      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as
        | { units: AvailabilityUnit[]; addOns: AvailabilityAddOn[] }
        | { message?: string }
        | null;

      if (cancelled) return;

      if (!res.ok) {
        setUnits([]);
        setAddons([]);
        setError((data as { message?: string } | null)?.message ?? "Gagal load availability");
        setLoading(false);
        return;
      }

      const payload = data as { units: AvailabilityUnit[]; addOns: AvailabilityAddOn[] };
      setUnits(payload.units);
      setAddons(payload.addOns);

      setUnitQty((prev) => {
        const next: Record<string, number> = {};
        for (const u of payload.units) next[u.id] = Math.min(u.available, prev[u.id] ?? 0);
        return next;
      });
      setAddonQty((prev) => {
        const next: Record<string, number> = {};
        for (const a of payload.addOns) next[a.id] = prev[a.id] ?? 0;
        return next;
      });
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, filterType]);

  const autoAddonQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) {
      const qty = unitQty[u.id] ?? 0;
      if (!qty) continue;

      // Old single autoAddOn logic (backward compatibility)
      const oldAddOnId = u.autoAddOnId ?? "";
      const oldMode = (u.autoAddOnMode ?? "") as "per_pax" | "per_unit" | "per_booking" | "per_adult" | "per_child_5_10" | "";
      
      const process = (addOnId: string, mode: string) => {
        const current = map.get(addOnId) ?? 0;
        if (mode === "per_pax") map.set(addOnId, current + totalGuest * qty);
        else if (mode === "per_adult") map.set(addOnId, current + adultPax * qty);
        else if (mode === "per_child_5_10") map.set(addOnId, current + child5to10Pax * qty);
        else if (mode === "per_unit") map.set(addOnId, current + qty);
        else if (mode === "per_booking") map.set(addOnId, current + 1);
      };

      if (oldAddOnId && oldMode) {
        process(oldAddOnId, oldMode);
      }

      // New multiple autoAddOns logic
      if ((u as any).autoAddOnsJson) {
        try {
          const multi = JSON.parse((u as any).autoAddOnsJson) as { addOnId: string; mode: string }[];
          for (const item of multi) {
            if (item.addOnId && item.mode) {
              process(item.addOnId, item.mode);
            }
          }
        } catch {}
      }
    }
    return Object.fromEntries(map.entries()) as Record<string, number>;
  }, [units, unitQty, totalGuest, adultPax, child5to10Pax]);

  const effectiveAddonQty = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of addons) {
      const manual = addonQty[a.id] ?? 0;
      const auto = autoAddonQty[a.id] ?? 0;
      out[a.id] = manual + auto;
    }
    return out;
  }, [addons, addonQty, autoAddonQty]);

  const estimatedAmount = useMemo(() => {
    let base = 0;
    for (const u of units) {
      const qty = unitQty[u.id] ?? 0;
      if (!qty) continue;
      base += qty * sumDailyPrice(u);
    }

    const addonAmount = addons.reduce((acc, a) => acc + (effectiveAddonQty[a.id] ?? 0) * a.price, 0);
    return base + addonAmount;
  }, [checkIn, checkOut, units, unitQty, addons, effectiveAddonQty]);

  const visibleUnits = useMemo(() => {
    const byType = filterType ? units.filter((u) => u.type === filterType) : units;
    if (filterCategory) return byType.filter((u) => (u.category ?? "") === filterCategory);
    return byType;
  }, [filterType, filterCategory, units]);

  const UNIT_PAGE_SIZE = 6;
  const shownUnitBaseCount = useMemo(() => Math.min(visibleUnits.length, unitPage * UNIT_PAGE_SIZE), [unitPage, visibleUnits.length]);
  const pagedVisibleUnits = useMemo(() => {
    const base = visibleUnits.slice(0, shownUnitBaseCount);
    const selectedExtra = visibleUnits.filter((u) => (unitQty[u.id] ?? 0) > 0 && !base.some((b) => b.id === u.id));
    return [...base, ...selectedExtra];
  }, [shownUnitBaseCount, unitQty, visibleUnits]);

  const selectedVisibleCount = useMemo(
    () => visibleUnits.reduce((acc, u) => acc + (unitQty[u.id] ?? 0), 0),
    [visibleUnits, unitQty],
  );

  const totalCapacity = useMemo(
    () => visibleUnits.reduce((acc, u) => acc + u.capacity * (unitQty[u.id] ?? 0), 0),
    [visibleUnits, unitQty],
  );

  const guestOverCapacity = useMemo(
    () => (totalCapacity > 0 ? adultPax > totalCapacity : false),
    [adultPax, totalCapacity],
  );

  const selectedVisibleUnits = useMemo(() => {
    return visibleUnits.filter(u => (unitQty[u.id] || 0) > 0);
  }, [visibleUnits, unitQty]);

  const checkInInfo = useMemo(() => formatStayDate(checkIn), [checkIn]);
  const checkOutInfo = useMemo(() => formatStayDate(checkOut), [checkOut]);
  const stayNights = useMemo(() => calculateStayNights(checkIn, checkOut), [checkIn, checkOut]);

  const sidebarContent = (
    <div className="sticky top-6 space-y-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121C11] text-[#F6F5F0] shadow-2xl shadow-black/50">
        {/* Header - Luxury Pine Timber */}
        <div className="border-b border-white/10 bg-[#162415] px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-normal tracking-wide text-[#F6F5F0]">
                Ringkasan Reservasi
              </h3>
              <p className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                Woodforest Jayagiri 48
              </p>
            </div>
            <span className="font-mono text-xs text-[#F6F5F0]/50">1.620 mdpl</span>
          </div>
        </div>
        
        <div className="p-5 sm:p-6 space-y-6">
          {/* Jadwal & Tamu */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Rencana Kunjungan</span>
              <button 
                type="button"
                onClick={() => setCurrentStep(1)} 
                className="text-xs font-mono text-[#86A86C] hover:underline"
              >
                Ubah
              </button>
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-start">
                <span className="text-[#F6F5F0]/60">Tanggal Menginap</span>
                <span className="font-mono tabular-nums text-right text-[#F6F5F0]">
                  {checkIn ? formatDateWIB(new Date(checkIn)) : "Pilih Tanggal"}
                  {checkOut && <span className="mx-1 text-[#F6F5F0]/40">—</span>}
                  {checkOut ? formatDateWIB(new Date(checkOut)) : ""}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[#F6F5F0]/60">Komposisi Tamu</span>
                <span className="font-mono tabular-nums text-[#86A86C]">
                  {totalGuest} Tamu ({adultPax}D, {child5to10Pax + childUnder5Pax}A)
                </span>
              </div>
            </div>
          </div>

          {/* Unit Terpilih */}
          <div className="space-y-4">
            <div className="border-b border-white/10 pb-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Akomodasi Terpilih</span>
            </div>
            {selectedVisibleUnits.length > 0 ? (
              <div className="space-y-4">
                {selectedVisibleUnits.map(u => {
                  const qty = unitQty[u.id] || 0;
                  return (
                    <div key={u.id} className="flex justify-between items-start gap-3 text-xs">
                      <div>
                        <p className="font-medium text-[#F6F5F0]">{u.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded bg-[#162415] border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#86A86C]">
                            {qty} Unit
                          </span>
                          {u.capacity > 0 && (
                            <span className="text-[10px] font-mono text-[#F6F5F0]/50">
                              Maks {u.capacity * qty} Tamu
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-medium text-[#F6F5F0]">{formatIDR(sumDailyPrice(u) * qty)}</span>
                    </div>
                  );
                })}

                {/* Kavling Selection Info */}
                {kavlingSelected.length > 0 && (
                  <div className="rounded-xl bg-[#162415] border border-white/10 p-3.5 space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50 block">Kavling Terpilih</span>
                    <span className="font-mono tabular-nums text-sm font-bold text-[#86A86C]">
                      {kavlingSelected.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-[#162415] border border-white/5 p-4 text-center">
                <p className="text-xs text-[#F6F5F0]/60">Pilih unit akomodasi untuk melanjutkan</p>
              </div>
            )}
          </div>

          {/* Layanan Tambahan (Manual + Auto) */}
          {addons.some(a => effectiveAddonQty[a.id] > 0) && (
            <div className="space-y-4">
              <div className="border-b border-white/10 pb-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Layanan Tambahan</span>
              </div>
              <div className="space-y-3">
                {addons.filter(a => effectiveAddonQty[a.id] > 0).map(a => (
                  <div key={a.id} className="flex justify-between items-start gap-3 text-xs">
                    <div>
                      <span className="text-[#F6F5F0]">{a.name}</span>
                      <span className="font-mono text-[#F6F5F0]/50 ml-2">×{effectiveAddonQty[a.id]}</span>
                    </div>
                    <span className="font-mono tabular-nums text-[#86A86C]">{formatIDR(a.price * effectiveAddonQty[a.id])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transparent Inclusions Guarantee */}
          <div className="rounded-xl bg-[#0B120A] border border-[#86A86C]/20 p-4 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#86A86C] block font-bold">
              Transparansi Rimba
            </span>
            <p className="text-[11px] text-[#F6F5F0]/70 leading-relaxed">
              Termasuk tiket gerbang masuk Perhutani, parkir aman, akses listrik stopkontak lot, serta pemanas air privat tanpa biaya tersembunyi.
            </p>
          </div>

          {/* Total Breakdown */}
          <div className="rounded-xl bg-[#0B120A] border border-white/10 p-5 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono uppercase tracking-wider text-[#F6F5F0]/60">Subtotal Akomodasi</span>
              <span className="font-mono tabular-nums text-[#F6F5F0]">
                {formatIDR(selectedVisibleUnits.reduce((acc, u) => acc + (sumDailyPrice(u) * (unitQty[u.id] || 0)), 0))}
              </span>
            </div>
            {addons.some(a => effectiveAddonQty[a.id] > 0) && (
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono uppercase tracking-wider text-[#F6F5F0]/60">Layanan Tambahan</span>
                <span className="font-mono tabular-nums text-[#F6F5F0]">
                  {formatIDR(addons.reduce((acc, a) => acc + (a.price * (effectiveAddonQty[a.id] || 0)), 0))}
                </span>
              </div>
            )}
            <div className="h-px bg-white/10 my-1" />
            <div className="flex justify-between items-baseline pt-1">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C] block">
                  Estimasi Total
                </span>
                <span className="text-[10px] text-[#F6F5F0]/50 font-mono">*Termasuk fasilitas lengkap</span>
              </div>
              <span className="font-mono tabular-nums text-2xl font-bold text-[#86A86C]">
                {formatIDR(estimatedAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button Section */}
        <div className="bg-[#162415] p-5 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              if (currentStep === 1) setCurrentStep(2);
              else if (currentStep === 2) setCurrentStep(3);
              else onSubmit(new Event('submit') as any);
            }}
            disabled={
              (currentStep === 1 && !filterCategory) || 
              (currentStep === 2 && (!checkIn || !checkOut || selectedVisibleCount === 0 || (requiredKavlings > 0 && kavlingSelected.length !== requiredKavlings))) || 
              (currentStep === 3 && (!name || !phone || !email))
            }
            className="w-full rounded-xl bg-[#86A86C] py-4 text-xs font-mono font-bold uppercase tracking-[0.2em] text-[#090E08] shadow-lg shadow-[#86A86C]/10 transition-all hover:bg-[#97bd7c] active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span>{currentStep === 1 ? "Lanjut Pilih Unit →" : currentStep === 2 ? "Lanjut Isi Data →" : "Konfirmasi Booking →"}</span>
          </button>
        </div>
      </div>

      {/* Trust Badge */}
      <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-[#121C11] border border-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#162415] text-[#86A86C] border border-white/5">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="space-y-0.5">
          <span className="block text-[11px] font-medium text-[#F6F5F0]">Reservasi Resmi Woodforest</span>
          <span className="block text-[10px] font-mono text-[#86A86C]">Konfirmasi Instan ke WhatsApp & Email</span>
        </div>
      </div>
    </div>
  );

  async function onSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const items = visibleUnits
      .map((u) => ({ unitId: u.id, quantity: Number(unitQty[u.id] ?? 0) }))
      .filter((x) => x.quantity > 0);
    const addOns = addons
      .map((a) => ({ addOnId: a.id, quantity: Number(addonQty[a.id] ?? 0) }))
      .filter((x) => x.quantity > 0);

    if (kavlingAmbiguous && !effectiveKavlingScope) {
      setError("Untuk pilih kavling, pilih qty hanya di salah satu: Paket / Paket Private / Camping Mandiri (atau filter kategori).");
      setSubmitting(false);
      return;
    }

    if (effectiveKavlingScope) {
      if (requiredKavlings > 0 && kavlingSelected.length !== requiredKavlings) {
        setError(
          `Pilih ${requiredKavlings} kavling untuk ${
            effectiveKavlingScope === "mixed"
              ? "Paket + Camping Mandiri + Paket Private"
              : effectiveKavlingScope === "mandiri"
              ? "Camping Mandiri"
              : effectiveKavlingScope === "private"
                ? "Paket Private"
                : "Paket"
          }.`,
        );
        setSubmitting(false);
        return;
      }
    }

    if (!email.trim()) {
      setError("Email wajib diisi.");
      setSubmitting(false);
      return;
    }

    let draftHold: BookingDraft["hold"] = effectiveKavlingScope && hold ? { id: hold.id, token: hold.token, expiresAt: hold.expiresAt } : undefined;
    if (effectiveKavlingScope && requiredKavlings > 0) {
      const res = await fetch("/api/public/kavlings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkIn,
          checkOut,
          scope: effectiveKavlingScope,
          numbers: kavlingSelected,
          holdId: hold?.id,
          holdToken: hold?.token,
        }),
      });
      const data = (await res.json().catch(() => null)) as { holdId?: string; holdToken?: string; expiresAt?: string; message?: string } | null;
      if (!res.ok) {
        setError(data?.message ?? "Gagal hold kavling");
        setSubmitting(false);
        return;
      }
      if (data?.holdId && data?.holdToken && data?.expiresAt) {
        draftHold = { id: data.holdId, token: data.holdToken, expiresAt: data.expiresAt };
        setHold({ id: data.holdId, token: data.holdToken, expiresAt: data.expiresAt });
      }
    }

    const draft: BookingDraft = {
      customer: { name, phone, email: email.trim() },
      specialRequest: specialRequest.trim() ? specialRequest.trim() : null,
      checkIn,
      checkOut,
      totalGuest: Number(totalGuest),
      adultPax: Number(adultPax),
      child5to10Pax: Number(child5to10Pax),
      childUnder5Pax: Number(childUnder5Pax),
      kavlingScope: (effectiveKavlingScope ?? "") as BookingDraft["kavlingScope"],
      kavlings: effectiveKavlingScope ? kavlingSelected : [],
      hold: draftHold,
      items,
      addOns,
      display: {
        items: items.map((it) => ({ unitId: it.unitId, name: units.find((u) => u.id === it.unitId)?.name ?? it.unitId, quantity: it.quantity })),
        addOns: addons
          .map((a) => ({ addOnId: a.id, name: a.name, price: a.price, quantity: Number(effectiveAddonQty[a.id] ?? 0) }))
          .filter((x) => x.quantity > 0),
      },
      amountEstimate: estimatedAmount,
      createdAt: new Date().toISOString(),
    };

    try {
      preserveHoldOnUnmountRef.current = true;
      sessionStorage.setItem("wf_booking_draft", JSON.stringify(draft));
      setSubmitting(false);
      router.push("/booking/confirm");
      return;
    } catch {
      preserveHoldOnUnmountRef.current = false;
      setError("Gagal menyiapkan konfirmasi. Coba refresh halaman.");
      setSubmitting(false);
      return;
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#090E08] text-[#F6F5F0] selection:bg-[#86A86C]/25 selection:text-[#F6F5F0] pb-48 sm:pb-24">
      {/* Top Bar - 3-Zone Contract */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090E08]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4">
          {/* Zone 1: Wordmark & Marker */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="group flex flex-col text-left outline-none"
            >
              <span className="font-serif text-lg tracking-wider text-[#F6F5F0] transition-colors group-hover:text-[#86A86C] sm:text-xl">
                WOODFOREST JAYAGIRI 48
              </span>
              <span className="text-[10px] tracking-widest text-[#F6F5F0]/50 uppercase font-sans">
                1.620 mdpl · Lembang
              </span>
            </button>
          </div>

          {/* Zone 2: Clean Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/70">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`hover:text-[#86A86C] transition-colors ${currentStep === 1 ? "text-[#86A86C]" : ""}`}
            >
              Akomodasi
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentStep === 1 && categoryOptions.length) {
                  setFilterCategory(categoryOptions[0]);
                }
                setCurrentStep(2);
                setKavlingTab("map");
              }}
              className="hover:text-[#86A86C] transition-colors"
            >
              Peta Rimba
            </button>
            <button
              type="button"
              onClick={() => setRulesModalOpen(true)}
              className="hover:text-[#86A86C] transition-colors"
            >
              Ketentuan Rimba
            </button>
          </nav>

          {/* Zone 3: Quick Action */}
          <div className="flex items-center gap-3">
            <a
              href="https://wa.me/628112090808"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121C11] px-3.5 py-2 text-xs font-mono uppercase tracking-wider text-[#F6F5F0] hover:border-[#86A86C]/40 hover:text-[#86A86C] transition-all"
            >
              <span className="h-2 w-2 rounded-full bg-[#86A86C] animate-pulse" />
              <span>Concierge WA</span>
            </a>
          </div>
        </div>
      </header>

      {/* Atmospheric Hero Section */}
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0B120A] py-10 sm:py-16">
        <div className="absolute inset-0 z-0 opacity-25">
          <div className="absolute inset-0 bg-gradient-to-t from-[#090E08] via-transparent to-[#090E08]/80" />
          <div className="h-full w-full bg-[radial-gradient(#86A86C_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            {/* Climatology Trust Beacon */}
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.25em] text-[#86A86C]">
              <span>1.620 mdpl</span>
              <span className="text-white/30">·</span>
              <span>Suhu Malam 12°–18°C</span>
              <span className="text-white/30">·</span>
              <span>Cikole Lembang</span>
            </div>

            <h1 className="font-serif text-3xl font-normal tracking-tight text-[#F6F5F0] sm:text-5xl max-w-3xl leading-tight">
              Glamping & Camping di Ketinggian Rimba Jayagiri
            </h1>
            <p className="mt-4 max-w-2xl text-sm sm:text-base font-normal text-[#F6F5F0]/70 leading-relaxed">
              Nikmati sejuknya alam pinus Jayagiri 48 dengan pemanas air privat, parkir terjaga, dan akses listrik di setiap kavling tanpa biaya tersembunyi.
            </p>

            {/* Inclusions Ribbon */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-mono text-[#F6F5F0]/60">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                Tiket Gerbang Perhutani Termasuk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                Parkir Kendaraan Terjaga
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                Akses Listrik Lot
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                Water Heater Privat
              </span>
            </div>
          </div>

          {/* Grounded Booking Dock */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#121C11] p-4 sm:p-6 shadow-2xl shadow-black/80">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4 items-center">
              {/* Check-In Tile */}
              <div 
                role="button"
                tabIndex={0}
                onClick={openCheckInPicker}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCheckInPicker();
                  }
                }}
                className="group relative cursor-pointer rounded-xl border border-white/10 bg-[#162415] p-3.5 transition-all hover:border-[#86A86C]/40 hover:bg-[#1A2C19]"
              >
                <input
                  ref={checkInInputRef}
                  type="date"
                  value={checkIn}
                  min={minDate || undefined}
                  onChange={(e) => handleCheckInChange(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="native-date-full-clickable"
                  required
                  aria-label="Pilih tanggal check-in"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Check-in</span>
                  <span className="text-[10px] font-mono text-[#86A86C]">14:00 WIB</span>
                </div>
                <div className="mt-1">
                  <div className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#F6F5F0]">
                    {checkInInfo.formattedDate}
                  </div>
                  <div className="text-[11px] text-[#F6F5F0]/60">{checkInInfo.dayName}</div>
                </div>
              </div>

              {/* Check-Out Tile */}
              <div 
                role="button"
                tabIndex={0}
                onClick={openCheckOutPicker}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCheckOutPicker();
                  }
                }}
                className="group relative cursor-pointer rounded-xl border border-white/10 bg-[#162415] p-3.5 transition-all hover:border-[#86A86C]/40 hover:bg-[#1A2C19]"
              >
                <input
                  ref={checkOutInputRef}
                  type="date"
                  value={checkOut}
                  min={checkIn || minDate || undefined}
                  onChange={(e) => handleCheckOutChange(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  className="native-date-full-clickable"
                  required
                  aria-label="Pilih tanggal check-out"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Check-out</span>
                  <span className="text-[10px] font-mono text-[#86A86C]">12:00 WIB</span>
                </div>
                <div className="mt-1">
                  <div className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#F6F5F0]">
                    {checkOutInfo.formattedDate}
                  </div>
                  <div className="text-[11px] text-[#F6F5F0]/60">
                    {checkOutInfo.dayName} {stayNights > 0 ? `· ${stayNights} Malam` : ""}
                  </div>
                </div>
              </div>

              {/* Guests Tile */}
              <div className="rounded-xl border border-white/10 bg-[#162415] p-3.5 md:col-span-1 lg:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]/50">Komposisi Tamu</span>
                  <span className="font-mono text-xs text-[#86A86C] font-bold">Total {totalGuest} Tamu</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-[#121C11] border border-white/5">
                    <span className="text-[10px] text-[#F6F5F0]/60 font-mono">Dewasa (10+)</span>
                    <div className="mt-1">
                      <QuantityStepper value={adultPax} min={1} size="sm" ariaLabel="Dewasa" onChange={setAdultPax} />
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-[#121C11] border border-white/5">
                    <span className="text-[10px] text-[#F6F5F0]/60 font-mono">Anak (5-10)</span>
                    <div className="mt-1">
                      <QuantityStepper value={child5to10Pax} min={0} size="sm" ariaLabel="Anak" onChange={setChild5to10Pax} />
                    </div>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-[#121C11] border border-white/5">
                    <span className="text-[10px] text-[#86A86C] font-mono">Balita (&lt;5)</span>
                    <div className="mt-1">
                      <QuantityStepper value={childUnder5Pax} min={0} size="sm" ariaLabel="Balita" onChange={setChildUnder5Pax} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {success ? (
          <>
            <style jsx global>{`
              @media print {
                @page {
                  size: A4;
                  margin: 5mm;
                }
                body {
                  background: #ffffff !important;
                }
                .no-print {
                  display: none !important;
                }
                .print-page {
                  box-shadow: none !important;
                  border: none !important;
                  zoom: 0.92;
                }
                .print-invoice {
                  border: none !important;
                }
                .print-invoice * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                .print-invoice .print-tight {
                  padding: 4px 8px 8px !important;
                }
                .print-invoice .print-compact-text {
                  font-size: 10.5px !important;
                  line-height: 1.3 !important;
                }
                .print-invoice .print-mt-0 {
                  margin-top: 0 !important;
                }
                .print-invoice .print-grid {
                  gap: 8px !important;
                }
                .print-invoice .print-box {
                  break-inside: avoid;
                  page-break-inside: avoid;
                  padding: 10px !important;
                }
                .print-invoice .print-hide {
                  display: none !important;
                }
                .print-invoice .print-logo {
                  height: 120px !important;
                  width: 120px !important;
                }
              }
            `}</style>
            <div className="mt-6 print-mt-0">
              <div className="print-page print-invoice overflow-hidden rounded-[1.5rem] border border-[#E8E8E1] bg-white shadow-sm transition-all duration-700 hover:shadow-xl hover:shadow-[#2D3E10]/5">
                <div className="p-8 print-tight print-compact-text">
                  <div className="text-center">
                    <img src="/brand/logowf.png" alt="Woodforest" className="print-logo mx-auto h-28 w-28 object-contain" />
                    <div className="mt-3 text-xl font-serif text-[#2D3E10] tracking-wide">WOODFOREST JAYAGIRI 48</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.25em] text-[#2D3E10]/70">1.620 mdpl · Cikole Lembang Bandung Barat</div>
                    <div className="mt-3 text-[11px] font-medium text-[#2D3E10]/70">admin@woodforestjayagiri48.com · +62 811-2090-808</div>
                    <div className="mt-1 text-[10px] font-medium text-[#2D3E10]/70">Check-in 14:00 WIB · Check-out 12:00 WIB</div>
                  </div>

                  <div className="my-6 h-px bg-[#E8E8E1]" />

                  {invoice ? (
                    <>
                      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#2D3E10]/60">Voucher Resmi Reservasi</span>
                          <div className="text-sm font-bold text-[#2D3E10]">Yth. {invoice.customer.name},</div>
                          <p className="max-w-xs text-xs leading-relaxed text-[#2D3E10]/60">Terima kasih telah memilih Woodforest Jayagiri 48. Berikut adalah detail konfirmasi reservasi resmi Anda.</p>
                        </div>
                        <div className="flex flex-col gap-3 md:text-right">
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#2D3E10]/70">Booking ID</div>
                            <div className="mt-0.5 font-mono text-base font-bold text-[#2D3E10]">{invoice.code}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#2D3E10]/70">Status</div>
                            <div className="mt-0.5">
                              <span className={`text-xs font-mono uppercase font-bold ${
                                invoice.payment.paidAmount >= invoice.payment.amount 
                                  ? "text-emerald-700" 
                                  : "text-amber-700"
                              }`}>
                                {invoice.payment.paidAmount >= invoice.payment.amount ? "Terbayar / Confirmed" : "Menunggu Pembayaran"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="my-8 h-px bg-[#E8E8E1]" />

                      <div className="print-grid grid grid-cols-1 gap-6 md:grid-cols-5">
                        <div className="print-box rounded-[1.2rem] border border-[#E8E8E1] bg-[#F1F3EE]/30 p-6 md:col-span-3">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[#2D3E10]">Detail Booking</h4>
                          
                          <div className="mt-6 space-y-4">
                            {(invoice.items ?? []).map((it, idx) => (
                              <div key={`${it.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                <div className="font-bold text-[#2D3E10]">{it.name}</div>
                                <div className="font-mono text-[#2D3E10]/60">x{it.quantity}</div>
                              </div>
                            ))}
                          </div>

                          {invoice.addOns?.length ? (
                            <div className="mt-6 pt-6 border-t border-[#E8E8E1]">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/70 mb-4">Add-Ons</div>
                              <div className="space-y-3">
                                {invoice.addOns.map((a, idx) => (
                                  <div key={`${a.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                    <div className="text-[#2D3E10]">
                                      {a.name} <span className="ml-1 text-[10px] font-bold text-[#2D3E10]/70">({formatIDR(a.price)})</span>
                                    </div>
                                    <div className="font-mono text-[#2D3E10]/60">x{a.quantity}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-8 pt-6 border-t border-[#E8E8E1]">
                            <div className="grid grid-cols-2 gap-y-4 text-xs">
                              <div className="text-[#2D3E10]/70">Check-in</div>
                              <div className="text-right font-bold text-[#2D3E10]">{formatDateWIB(new Date(invoice.checkIn))}</div>
                              <div className="text-[#2D3E10]/70">Check-out</div>
                              <div className="text-right font-bold text-[#2D3E10]">{formatDateWIB(new Date(invoice.checkOut))}</div>
                              <div className="text-[#2D3E10]/70">Guest</div>
                              <div className="text-right font-bold text-[#2D3E10]">{invoice.totalGuest} Tamu</div>
                              <div className="text-[#2D3E10]/70">Kavling</div>
                              <div className="text-right font-mono font-bold text-[#2D3E10]">
                                {invoice.kavlings?.length ? invoice.kavlings.slice().sort((a, b) => a - b).join(", ") : "-"}
                              </div>
                            </div>
                          </div>

                          {invoice.specialRequest ? (
                            <div className="mt-6 pt-6 border-t border-[#E8E8E1]">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/70 mb-2">Special Request</div>
                              <p className="text-xs italic text-[#2D3E10]/60 leading-relaxed">"{invoice.specialRequest}"</p>
                            </div>
                          ) : null}
                        </div>

                        <div className="print-box flex flex-col rounded-[1.2rem] border border-[#E8E8E1] p-6 md:col-span-2">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[#2D3E10]">Ringkasan Pembayaran</h4>

                          {(() => {
                            const addOnAmount = invoice.addOns.reduce((acc, a) => acc + a.quantity * a.price, 0);
                            const baseAmount = Math.max(0, invoice.payment.amount - addOnAmount);
                            return (
                              <div className="mt-6 flex-1 space-y-4 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[#2D3E10]/70">Room / Paket</div>
                                  <div className="font-bold text-[#2D3E10]">{formatIDR(baseAmount)}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[#2D3E10]/70">Add-Ons</div>
                                  <div className="font-bold text-[#2D3E10]">{formatIDR(addOnAmount)}</div>
                                </div>
                                <div className="my-4 h-px bg-[#E8E8E1]" />
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <div className="font-bold text-[#2D3E10]">Total</div>
                                  <div className="text-lg font-bold text-primary">{formatIDR(invoice.payment.amount)}</div>
                                </div>
                                <div className="mt-8 space-y-3 rounded-xl bg-[#F1F3EE]/50 p-4">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <div className="font-bold uppercase tracking-widest text-[#2D3E10]/70">Method</div>
                                    <div className="font-bold text-[#2D3E10]">{invoice.payment.method ?? "-"}</div>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <div className="font-bold uppercase tracking-widest text-[#2D3E10]/70">Amount Paid</div>
                                    <div className="font-bold text-[#2D3E10]">{formatIDR(invoice.payment.paidAmount)}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="print-hide mt-8 rounded-xl bg-[#F1F3EE] p-4 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/70">
                          Simpan halaman ini sebagai bukti booking. Tunjukkan Booking ID saat check-in.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-[#2D3E10]/70">Menyiapkan invoice...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex min-h-[3.5rem] flex-1 items-center justify-center rounded-xl bg-[#86A86C] hover:bg-[#97ba7c] px-8 py-3.5 text-xs font-mono uppercase tracking-wider font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 transition-all active:scale-[0.98] disabled:opacity-50"
                  disabled={!invoice}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Cetak / Simpan E-Voucher</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem("wf_booking_draft");
                    window.location.href = window.location.pathname;
                  }}
                  className="flex min-h-[3.5rem] flex-1 items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-8 py-3.5 text-xs font-mono uppercase tracking-wider text-white/80 transition-all hover:bg-[#162415] hover:text-white active:scale-[0.98]"
                >
                  Buat Reservasi Baru
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-8">
            {/* Architectural Stage Indicator */}
            <div className="mx-auto max-w-3xl">
              <div className="grid grid-cols-3 gap-2 border-b border-white/10 pb-4 text-center">
                {[
                  { step: 1, label: "01 AKOMODASI" },
                  { step: 2, label: "02 KAVLING & UNIT" },
                  { step: 3, label: "03 IDENTITAS TAMU" },
                ].map((s) => {
                  const isActive = currentStep === s.step;
                  const isCompleted = currentStep > s.step;
                  return (
                    <button
                      key={s.step}
                      type="button"
                      disabled={!isCompleted && s.step > currentStep}
                      onClick={() => setCurrentStep(s.step)}
                      className={`text-xs font-mono tracking-wider transition-colors uppercase ${
                        isActive
                          ? "text-[#86A86C] font-bold border-b-2 border-[#86A86C] pb-2 -mb-4.5"
                          : isCompleted
                          ? "text-[#F6F5F0] hover:text-[#86A86C]"
                          : "text-[#F6F5F0]/30 cursor-not-allowed"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
              {/* Main Step Content */}
              <div className="space-y-8">
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div>
                      <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#86A86C] block mb-1">
                        Pilihan Penginapan Rimba
                      </span>
                      <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#F6F5F0]">
                        Pilih Kategori Akomodasi
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-[#F6F5F0]/70 leading-relaxed">
                        Pilih tipe pengalaman bermalam Anda di tengah ketenangan hutan pinus 1.620 mdpl Jayagiri Lembang.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {categoryOptions.map((cat) => {
                        return (
                          <div
                            key={cat}
                            className="group relative flex flex-col h-full rounded-2xl border border-white/10 bg-[#121C11] overflow-hidden transition-all hover:border-[#86A86C]/40 hover:-translate-y-1 shadow-lg"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (filterCategory !== cat || currentStep > 1) {
                                  resetSelection();
                                }
                                setFilterCategory(cat);
                                setCurrentStep(2);
                              }}
                              className="flex flex-col h-full text-left outline-none"
                            >
                              <div className="relative h-48 w-full overflow-hidden bg-[#090E08]">
                                {packageConfigs[cat]?.imageUrl ? (
                                  <img
                                    src={`${packageConfigs[cat].imageUrl}?t=${kavlingMapAssetVersion}`}
                                    alt={cat}
                                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="h-full w-full bg-gradient-to-t from-[#121C11] to-[#162415]" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#121C11] via-transparent to-transparent" />
                                <div className="absolute top-3 right-3 text-[10px] font-mono uppercase tracking-widest text-[#86A86C] bg-[#090E08]/80 px-2.5 py-1 rounded-md border border-white/10">
                                  1.620 mdpl
                                </div>
                              </div>

                              <div className="flex flex-col flex-1 p-5 sm:p-6 justify-between">
                                <div>
                                  <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#F6F5F0] group-hover:text-[#86A86C] transition-colors">
                                    {cat}
                                  </h3>
                                  <p className="mt-2 text-xs text-[#F6F5F0]/70 leading-relaxed">
                                    {packageConfigs[cat]?.description || (
                                      cat === "Glamping"
                                        ? "Kabin kayu dan glamping mewah berpemanas air privat di antara pepohonan pinus."
                                        : cat === "Paket"
                                        ? "Paket lengkap tenda berkapasitas keluarga dengan perlengkapan lengkap siap huni."
                                        : "Kavling camping mandiri dan campervan pitch bebas dengan pemandangan terbuka."
                                    )}
                                  </p>
                                  <div className="mt-4 text-[10px] font-mono text-[#F6F5F0]/50 tracking-wider">
                                    1.620 mdpl · Fasilitas Privat · Cikole Lembang
                                  </div>
                                </div>

                                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                                  <span className="text-xs font-mono uppercase tracking-wider text-[#86A86C] font-bold">
                                    Pilih Kategori Ini →
                                  </span>
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 cubic-bezier(0.16, 1, 0.3, 1) fill-mode-both">
                <div className="mb-8 sm:mb-12 flex flex-col text-left sm:text-center">
                  <div className="flex items-center justify-start sm:justify-center gap-2 mb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                    <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#86A86C]">
                      Langkah 02 — Konfigurasi Menginap
                    </span>
                  </div>
                  <h2 className="text-3xl font-serif tracking-tight text-[#F6F5F0] sm:text-4xl">
                    Pilihan Akomodasi & Penempatan Kavling
                  </h2>
                  <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm text-white/60">
                    Tentukan tipe unit kabin glamping atau kavling rimba favorit Anda di ketinggian 1.620 mdpl Cikole Lembang.
                  </p>
                </div>

                <div className="mx-auto w-full space-y-6 sm:space-y-8">
                  {/* Unified Stay Configuration Panel - Deep Pine Sanctuary */}
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121C11] shadow-2xl transition-all">
                    {/* Header: Title & Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#162415] px-5 py-3.5 sm:px-6">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-2 w-2 rounded-full bg-[#86A86C]" />
                        <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-[#F6F5F0]">
                          Jadwal Kunjungan & Tamu
                        </h3>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {stayNights > 0 && (
                          <span className="font-mono tabular-nums text-[#86A86C]">
                            {stayNights} Malam
                          </span>
                        )}
                        <span className="text-white/30">·</span>
                        <span className="font-mono tabular-nums text-white/80">
                          {totalGuest} Tamu Total
                        </span>
                      </div>
                    </div>

                    {/* Dates Grid: Check-in & Check-out */}
                    <div className="p-4 sm:p-6">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                        {/* Check-in Tile */}
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={openCheckInPicker}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openCheckInPicker();
                            }
                          }}
                          className="group relative cursor-pointer rounded-xl border border-white/10 bg-[#0B120A] p-4 transition-all hover:border-[#86A86C]/50 focus-within:border-[#86A86C]"
                        >
                          <input
                            ref={checkInInputRef}
                            type="date"
                            value={checkIn}
                            min={minDate || undefined}
                            onChange={(e) => handleCheckInChange(e.target.value)}
                            onClick={(e) => {
                              try {
                                e.currentTarget.showPicker?.();
                              } catch {}
                            }}
                            className="native-date-full-clickable"
                            required
                            aria-label="Pilih tanggal check-in"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Check-in</span>
                            <span className="text-[11px] font-mono text-white/60 transition-colors group-hover:text-[#86A86C]">
                              Pilih Tanggal ↗
                            </span>
                          </div>
                          <div className="mt-2.5">
                            <p className="text-base sm:text-lg font-mono tabular-nums font-bold text-[#F6F5F0] tracking-tight">
                              {checkInInfo.formattedDate}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
                              <span>{checkInInfo.dayName}</span>
                              <span>·</span>
                              <span className="text-white/40">Mulai 14:00 WIB</span>
                            </p>
                          </div>
                        </div>

                        {/* Check-out Tile */}
                        <div 
                          role="button"
                          tabIndex={0}
                          onClick={openCheckOutPicker}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openCheckOutPicker();
                            }
                          }}
                          className="group relative cursor-pointer rounded-xl border border-white/10 bg-[#0B120A] p-4 transition-all hover:border-[#86A86C]/50 focus-within:border-[#86A86C]"
                        >
                          <input
                            ref={checkOutInputRef}
                            type="date"
                            value={checkOut}
                            min={checkIn || minDate || undefined}
                            onChange={(e) => handleCheckOutChange(e.target.value)}
                            onClick={(e) => {
                              try {
                                e.currentTarget.showPicker?.();
                              } catch {}
                            }}
                            className="native-date-full-clickable"
                            required
                            aria-label="Pilih tanggal check-out"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Check-out</span>
                            <span className="text-[11px] font-mono text-white/60 transition-colors group-hover:text-[#86A86C]">
                              Pilih Tanggal ↗
                            </span>
                          </div>
                          <div className="mt-2.5">
                            <p className="text-base sm:text-lg font-mono tabular-nums font-bold text-[#F6F5F0] tracking-tight">
                              {checkOutInfo.formattedDate}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
                              <span>{checkOutInfo.dayName}</span>
                              <span>·</span>
                              <span className="text-white/40">Maks 12:00 WIB</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Guests Section */}
                    <div className="border-t border-white/10 bg-[#162415]/40 p-4 sm:p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                          Rincian Tamu
                        </span>
                        <span className="text-xs text-white/60 font-mono">
                          Total: <strong className="text-[#F6F5F0] font-bold tabular-nums">{totalGuest}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {/* Dewasa */}
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B120A] p-3.5 sm:p-4">
                          <div className="space-y-0.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-[#F6F5F0]">Dewasa</p>
                              <span className="text-[9px] font-mono uppercase tracking-wider text-[#86A86C]">· Kapasitas</span>
                            </div>
                            <p className="text-[11px] text-white/45">Usia 10+ tahun</p>
                          </div>
                          <QuantityStepper value={adultPax} min={1} size="sm" ariaLabel="Dewasa" onChange={setAdultPax} />
                        </div>

                        {/* Anak */}
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B120A] p-3.5 sm:p-4">
                          <div className="space-y-0.5 pr-2">
                            <p className="text-sm font-semibold text-[#F6F5F0]">Anak</p>
                            <p className="text-[11px] text-white/45">Usia 5 - 10 tahun</p>
                          </div>
                          <QuantityStepper value={child5to10Pax} min={0} size="sm" ariaLabel="Anak" onChange={setChild5to10Pax} />
                        </div>

                        {/* Balita */}
                        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B120A] p-3.5 sm:p-4">
                          <div className="space-y-0.5 pr-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-[#F6F5F0]">Balita</p>
                              <span className="text-[9px] font-mono uppercase tracking-wider text-[#86A86C]">· Gratis</span>
                            </div>
                            <p className="text-[11px] text-white/45">Usia &lt; 5 tahun</p>
                          </div>
                          <QuantityStepper value={childUnder5Pax} min={0} size="sm" ariaLabel="Balita" onChange={setChildUnder5Pax} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Unit List Header & Filter Bar */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2 pb-1">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-xl sm:text-2xl font-serif text-[#F6F5F0]">
                          Pilihan Akomodasi
                        </h3>
                        {filterCategory && (
                          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                            · {filterCategory}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-white/60 mt-1">
                        Harga per malam sudah termasuk tiket masuk Perhutani, parkir aman, dan akses air panas.
                      </p>
                    </div>

                    {/* Filter Type Dropdown */}
                    <div className="flex items-center gap-3">
                      <div className="relative group w-full sm:w-auto">
                        <select
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="h-11 sm:h-12 w-full appearance-none rounded-xl border border-white/15 bg-[#121C11] pl-4 pr-10 text-xs sm:text-sm font-mono text-[#F6F5F0] shadow-sm outline-none transition-all group-hover:border-[#86A86C]/50 focus:border-[#86A86C] sm:w-52 cursor-pointer"
                          aria-label="Filter berdasarkan tipe unit"
                        >
                          <option value="" className="bg-[#121C11] text-[#F6F5F0]">Semua Tipe Unit</option>
                          {typeOptions.map((t) => (
                            <option key={t} value={t} className="bg-[#121C11] text-[#F6F5F0]">{t}</option>
                          ))}
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86A86C] pointer-events-none transition-transform group-hover:translate-y-[-40%]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                
                {/* Unit Grid */}
                <div className="grid grid-cols-1 gap-6 sm:gap-8">
                  {pagedVisibleUnits.map((u, idx) => {
                    const inc = parseIncludesJson(u.includesJson);
                    const images = parseImagesJson(u.imagesJson);
                    const facilities = parseFacilitiesJson(u.facilitiesJson);
                    const isSelected = (unitQty[u.id] ?? 0) > 0;
                    
                    return (
                      <div 
                        key={u.id} 
                        className={`group flex flex-col overflow-hidden rounded-2xl border transition-all duration-500 ${
                          isSelected 
                            ? "border-[#86A86C] bg-[#162415] shadow-2xl ring-1 ring-[#86A86C]/40" 
                            : "border-white/10 bg-[#121C11] hover:border-white/20"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-stretch">
                          {/* Image Section */}
                          <div className="relative aspect-[16/9] sm:aspect-[16/10] lg:aspect-auto lg:w-[280px] xl:w-[320px] 2xl:w-[360px] overflow-hidden lg:shrink-0 p-3 sm:p-4 pb-0 lg:pr-0">
                            <div className="w-full h-full rounded-xl overflow-hidden relative">
                              <ImageCarousel images={images} className="h-full w-full rounded-none border-none" />
                              {u.available <= 0 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-sm">
                                  <span className="font-mono text-xs uppercase tracking-widest text-red-400 font-bold">
                                    Penuh Terisi
                                  </span>
                                </div>
                              )}
                              <div className="absolute left-3 top-3">
                                <div className="rounded-md bg-[#090E08]/85 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[#F6F5F0] backdrop-blur-md border border-white/10 shadow-sm">
                                  {u.type}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Content Section */}
                          <div className="flex flex-1 min-w-0 flex-col p-4 sm:p-5 lg:p-6 relative justify-between">
                            <div>
                              <div className="flex flex-col items-start text-left space-y-1.5 mb-2">
                                <h3 className="text-xl sm:text-2xl font-serif text-[#F6F5F0]">
                                  {u.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/60">
                                  <span className="font-mono text-white/80">{u.capacity} Tamu Maks</span>
                                  <span>·</span>
                                  <span className={`font-mono ${u.available > 2 ? 'text-[#86A86C]' : u.available > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {u.available > 0 ? `Sisa ${u.available} Unit` : 'Penuh'}
                                  </span>
                                  <span>·</span>
                                  <span className="text-white/45">1.620 mdpl Jayagiri</span>
                                </div>
                              </div>

                              {u.description && (
                                <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-white/65 line-clamp-2 text-left leading-relaxed">
                                  {u.description}
                                </p>
                              )}

                              {inc.length > 0 && (
                                <div className="mt-3 sm:mt-4 rounded-xl bg-[#0B120A] p-3 sm:p-3.5 border border-white/10">
                                  <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C] text-left">
                                    Fasilitas Termasuk
                                  </p>
                                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                                    {inc.slice(0, 4).map((t, idx) => (
                                      <li key={idx} className="flex items-center text-xs text-white/80 min-w-0">
                                        <span className="mr-2 text-[#86A86C] font-bold">✓</span>
                                        <span className="truncate">{t}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 pt-3.5 sm:mt-5 sm:pt-4 border-t border-white/10">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-0.5 text-left min-w-0">
                                  <p className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                                    Total Menginap ({stayNights} Malam)
                                  </p>
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-[#F6F5F0]">
                                      {formatIDR(sumDailyPrice(u))}
                                    </span>
                                    <span className="text-xs font-mono tabular-nums text-white/40">
                                      ({priceRangeLabel(u)} /malam)
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  <QuantityStepper
                                    value={unitQty[u.id] ?? 0}
                                    min={0}
                                    max={u.available}
                                    size="sm"
                                    disabled={u.available <= 0}
                                    ariaLabel={`qty ${u.name}`}
                                    onChange={(next) =>
                                      setUnitQty((s) => ({
                                        ...s,
                                        [u.id]: Math.max(0, Math.min(u.available, next)),
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              {visibleUnits.length > shownUnitBaseCount && (
                <div className="flex justify-center pt-8">
                  <button
                    type="button"
                    onClick={() => setUnitPage((p) => p + 1)}
                    className="group flex items-center gap-3 rounded-xl border border-white/15 bg-[#121C11] px-6 py-3 text-xs font-mono uppercase tracking-widest text-[#F6F5F0] transition-all hover:border-[#86A86C] hover:bg-[#162415] active:scale-95"
                  >
                    <span>Muat Lebih Banyak</span>
                    <svg className="h-4 w-4 text-[#86A86C] transition-transform duration-300 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Kavling Selection Section - Deep Pine Sanctuary */}
              {(effectiveKavlingScope || kavlingAmbiguous) && requiredKavlings > 0 && (
                <div className="rounded-2xl border border-white/10 bg-[#121C11] shadow-2xl transition-all duration-500 overflow-hidden">
                  {/* Header: Title, Tabs & Progress */}
                  <div className="border-b border-white/10 bg-[#162415] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-[#86A86C] animate-pulse" />
                          <h3 className="text-xl sm:text-2xl font-serif text-[#F6F5F0]">
                            Penentuan Titik Kavling Hutan
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-white/60">
                          1.620 mdpl · Tentukan posisi tenda & spot camping favorit Anda di antara deretan pinus.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Tab Switcher: Grid Spot vs Peta 2D Interaktif */}
                        <div className="inline-flex rounded-xl bg-[#090E08] p-1 border border-white/10">
                          <button
                            type="button"
                            onClick={() => setKavlingTab("grid")}
                            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all ${
                              kavlingTab === "grid"
                                ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                : "text-white/60 hover:text-white"
                            }`}
                          >
                            Pilihan Grid
                          </button>
                          <button
                            type="button"
                            onClick={() => setKavlingTab("map")}
                            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all ${
                              kavlingTab === "map"
                                ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                : "text-white/60 hover:text-white"
                            }`}
                          >
                            Peta Kawasan 2D
                          </button>
                        </div>

                        {/* Progress Indicator */}
                        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#090E08] px-3.5 py-1.5">
                          <span className="text-xs text-white/50 font-mono uppercase tracking-wider">Terpilih:</span>
                          <span className="font-mono tabular-nums text-sm font-bold text-[#86A86C]">
                            {kavlingSelected.length} / {requiredKavlings}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-white/40">Kavling</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 lg:p-8 space-y-6">
                    {/* Ambiguity or Scope Filter Alert */}
                    <div className="rounded-xl bg-[#0B120A] p-4 sm:p-5 border border-white/10">
                      {kavlingAmbiguous ? (
                        <div className="space-y-4">
                          {combinedAll ? (
                            <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                              Silakan pilih <span className="font-mono font-bold text-[#86A86C]">{requiredKavlings} kavling</span> untuk paket yang Anda tentukan.
                            </p>
                          ) : combinedNonPrivate ? (
                            <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                              Silakan pilih <span className="font-mono font-bold text-[#86A86C]">{requiredKavlings} kavling</span> untuk Paket + Camping Mandiri.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-3">
                              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#86A86C]">
                                Tentukan Kategori Kavling
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {kavlingQtyByGroup.mandiri > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setKavlingScopePick("mandiri")}
                                    className={`rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
                                      kavlingScopePick === "mandiri"
                                        ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                        : "bg-[#162415] border border-white/10 text-white/70 hover:border-white/20"
                                    }`}
                                  >
                                    Camping Mandiri
                                  </button>
                                )}
                                {kavlingQtyByGroup.paket > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setKavlingScopePick("paket")}
                                    className={`rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
                                      kavlingScopePick === "paket"
                                        ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                        : "bg-[#162415] border border-white/10 text-white/70 hover:border-white/20"
                                    }`}
                                  >
                                    Paket
                                  </button>
                                )}
                                {kavlingQtyByGroup.private > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setKavlingScopePick("private")}
                                    className={`rounded-xl px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
                                      kavlingScopePick === "private"
                                        ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                        : "bg-[#162415] border border-white/10 text-white/70 hover:border-white/20"
                                    }`}
                                  >
                                    Paket Private
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                          Silakan pilih <span className="font-mono font-bold text-[#86A86C]">{requiredKavlings} kavling</span> untuk area <strong className="text-[#F6F5F0]">{effectiveKavlingScope}</strong>.
                        </p>
                      )}
                    </div>

                    {/* Hold Timer Alert */}
                    {hold?.expiresAt && holdLeftLabel && (
                      <div className="rounded-xl border border-[#86A86C]/30 bg-[#162415] p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-2 w-2 rounded-full bg-[#86A86C] animate-pulse" />
                          <span className="text-xs font-mono uppercase tracking-wider text-white/70">
                            Sisa Waktu Hold Kavling:
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-bold text-[#86A86C]">
                          {holdLeftLabel}
                        </span>
                      </div>
                    )}

                    {/* Content View: In-Place Interactive Map vs Grid */}
                    {kavlingTab === "map" ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono uppercase tracking-wider text-white/60">
                            Peta Lokasi Kawasan (Bisa Digeser & Dizoom)
                          </span>
                          <button
                            type="button"
                            onClick={() => setKavlingMapOpen(true)}
                            className="text-xs font-mono uppercase tracking-wider text-[#86A86C] hover:underline"
                          >
                            Layar Penuh ↗
                          </button>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#0B120A] overflow-hidden p-2">
                          <InteractiveMapViewer src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`} />
                        </div>
                      </div>
                    ) : null}

                    {/* Block Filter Toolbar & Spot Grid (Always visible or in Grid mode) */}
                    <div className="space-y-4">
                      {availableBlocks.length > 1 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                              Filter Berdasarkan Blok
                            </span>
                            {selectedBlockFilter !== "ALL" && (
                              <button
                                type="button"
                                onClick={() => setSelectedBlockFilter("ALL")}
                                className="text-[10px] font-mono uppercase tracking-wider text-[#86A86C] hover:underline"
                              >
                                Tampilkan Semua ({kavlingAll.length})
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBlockFilter("ALL")}
                              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
                                selectedBlockFilter === "ALL"
                                  ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                  : "bg-[#0B120A] border border-white/10 text-white/70 hover:border-white/20"
                              }`}
                            >
                              <span>Semua Blok</span>
                              <span className="text-[10px] opacity-75">({kavlingAll.length})</span>
                            </button>
                            {availableBlocks.map((b) => (
                              <button
                                key={b.name}
                                type="button"
                                onClick={() => setSelectedBlockFilter(b.name)}
                                className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all ${
                                  selectedBlockFilter === b.name
                                    ? "bg-[#86A86C] text-[#090E08] font-bold shadow"
                                    : "bg-[#0B120A] border border-white/10 text-white/70 hover:border-white/20"
                                }`}
                              >
                                <span>{b.name}</span>
                                <span className="text-[10px] opacity-75">({b.count})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Spot Numbers Grid */}
                      <div className="grid grid-cols-4 min-[420px]:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 sm:gap-2.5">
                        {filteredKavlingAll.map((n) => {
                          const isPaid = kavlingPaid.includes(n);
                          const isHeld = kavlingHeld.includes(n);
                          const isOOO = kavlingOOO.includes(n);
                          const isTaken = kavlingTaken.includes(n);
                          const isSelected = kavlingSelected.includes(n);
                          const isPrivateInRange = kavlingPrivateRange && n >= kavlingPrivateRange.start && n <= kavlingPrivateRange.end;
                          const isMandiri = !isPrivateInRange;

                          let disabled = isTaken;
                          if (effectiveKavlingScope === "private" && isMandiri) disabled = true;
                          if (effectiveKavlingScope === "mandiri" && isPrivateInRange) disabled = true;
                          if (effectiveKavlingScope === "paket" && isPrivateInRange) disabled = true;
                          if (!effectiveKavlingScope) disabled = true;

                          return (
                            <button
                              key={n}
                              type="button"
                              disabled={disabled && !isSelected}
                              onClick={() => {
                                if (isSelected) {
                                  setKavlingSelected((s) => s.filter((x) => x !== n));
                                } else {
                                  if (kavlingSelected.length < requiredKavlings) {
                                    setKavlingSelected((s) => [...s, n]);
                                  }
                                }
                              }}
                              className={`group/kavling relative flex min-h-[3rem] items-center justify-center rounded-xl border text-xs font-mono tabular-nums font-bold transition-all duration-300 overflow-hidden ${
                                isSelected
                                  ? "border-[#86A86C] bg-[#86A86C] text-[#090E08] shadow-lg shadow-[#86A86C]/25 scale-105 z-10 font-black"
                                  : isOOO
                                  ? "border-white/5 bg-white/5 text-white/20 cursor-not-allowed"
                                  : isPaid
                                  ? "border-red-500/20 bg-red-950/20 text-red-400 cursor-not-allowed"
                                  : isHeld
                                  ? "border-amber-500/20 bg-amber-950/20 text-amber-400 cursor-not-allowed"
                                  : disabled
                                  ? "border-white/5 bg-white/5 text-white/20 cursor-not-allowed opacity-40"
                                  : "border-white/10 bg-[#0B120A] text-[#86A86C] hover:border-[#86A86C] hover:bg-[#86A86C]/10"
                              }`}
                            >
                              <span>{n}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 border-t border-white/10 pt-4 text-xs font-mono text-white/60">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md bg-[#86A86C] border border-[#86A86C]" />
                          <span className="text-[#F6F5F0]">Terpilih</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md bg-[#0B120A] border border-[#86A86C]/50" />
                          <span>Tersedia</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md bg-red-950/30 border border-red-500/30" />
                          <span>Sudah Dibooking</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md bg-amber-950/30 border border-amber-500/30" />
                          <span>Sedang Diproses</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-md bg-white/5 border border-white/10" />
                          <span>Perbaikan (OOO)</span>
                        </div>
                      </div>
                    </div>

                    {holdError ? (
                      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-mono text-red-300">
                        {holdError}
                      </div>
                    ) : null}

                    {kavlingMapOpen ? (
                      <Modal
                        open={kavlingMapOpen}
                        title="Site Map Kavling Jayagiri 1.620 mdpl"
                        variant="sanctuary"
                        onClose={() => setKavlingMapOpen(false)}
                        maxWidthClassName="max-w-6xl"
                      >
                        <InteractiveMapViewer src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`} />
                      </Modal>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Add-Ons Section - Deep Pine Sanctuary */}
              <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                      <h3 className="text-xl sm:text-2xl font-serif text-[#F6F5F0]">
                        Perlengkapan & Fasilitas Tambahan
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-white/60">
                      Kayu bakar, sleeping bag ekstra, atau kompor portabel untuk menghangatkan malam di hutan 1.620 mdpl.
                    </p>
                  </div>
                  <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                    Opsional Tambahan
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                  {addons.slice(0, showAllAddons ? addons.length : 3).map((a) => {
                    const isSelected = (effectiveAddonQty[a.id] ?? 0) > (autoAddonQty[a.id] ?? 0);
                    const auto = autoAddonQty[a.id] ?? 0;
                    return (
                      <div 
                        key={a.id} 
                        className={`group relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between gap-4 ${
                          isSelected 
                            ? "border-[#86A86C] bg-[#162415] shadow-xl ring-1 ring-[#86A86C]/40" 
                            : "border-white/10 bg-[#121C11] hover:border-white/20"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm sm:text-base font-semibold text-[#F6F5F0]">
                              {a.name}
                            </h4>
                            {auto > 0 && (
                              <span className="shrink-0 rounded-md bg-[#090E08] border border-white/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[#86A86C]">
                                {auto} Inc.
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-base sm:text-lg font-mono tabular-nums font-bold text-[#F6F5F0]">
                              {formatIDR(a.price)}
                            </span>
                            <span className="text-xs font-mono text-white/40">/ item</span>
                          </div>
                          <div className="text-[11px] font-mono text-white/50">
                            {a.stock - auto > 0 ? (
                              <span className={a.stock - auto <= 5 ? "text-amber-400" : "text-white/60"}>
                                Stok Tersedia: {a.stock - auto}
                              </span>
                            ) : (
                              <span className="text-red-400">Habis</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/10">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">Jumlah</span>
                          <QuantityStepper
                            value={effectiveAddonQty[a.id] ?? 0}
                            min={autoAddonQty[a.id] ?? 0}
                            max={a.stock}
                            size="sm"
                            ariaLabel={`qty ${a.name}`}
                            onChange={(next) => {
                              const auto = autoAddonQty[a.id] ?? 0;
                              const manual = Math.max(0, next - auto);
                              setAddonQty((s) => ({ ...s, [a.id]: manual }));
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {addons.length > 3 && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAllAddons(!showAllAddons)}
                      className="group flex items-center gap-2 rounded-xl border border-white/15 bg-[#121C11] px-5 py-2.5 text-xs font-mono uppercase tracking-wider text-[#F6F5F0] transition-all hover:border-[#86A86C] hover:bg-[#162415] active:scale-95"
                    >
                      <span>{showAllAddons ? "Sembunyikan Fasilitas" : "Tampilkan Semua Fasilitas"}</span>
                      <svg 
                        className={`h-3.5 w-3.5 text-[#86A86C] transition-transform duration-300 ${showAllAddons ? 'rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                {addons.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-[#121C11] p-8 text-center">
                    <h4 className="text-sm font-mono text-white/70">Belum Ada Fasilitas Tambahan</h4>
                    <p className="mt-1 text-xs text-white/40">Fasilitas standar sudah termasuk dalam paket penginapan.</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-mono text-red-300">
                  {error}
                </div>
              )}

              {guestOverCapacity && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs font-mono text-amber-300">
                  Kapasitas terlampaui: Jumlah tamu dewasa melebihi kapasitas unit yang dipilih. Silakan sesuaikan jumlah tamu atau tambah unit.
                </div>
              )}
            </div>
          </div>
        )}

            {currentStep === 3 && (
              <form 
                id="booking-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit(e);
                }}
                className="relative z-10"
              >
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 cubic-bezier(0.16, 1, 0.3, 1)">
                  <div className="mb-8 sm:mb-12 flex flex-col text-left sm:text-center">
                    <div className="flex items-center justify-start sm:justify-center gap-2 mb-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                      <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#86A86C]">
                        Langkah 03 — Finalisasi Registrasi
                      </span>
                    </div>
                    <h2 className="text-3xl font-serif tracking-tight text-[#F6F5F0] sm:text-4xl">
                      Identitas Tamu Pemesan
                    </h2>
                    <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm text-white/60">
                      Masukkan data diri resmi untuk konfirmasi voucher check-in dan asuransi kunjungan Perhutani Jayagiri.
                    </p>
                  </div>

                  <div className="space-y-6">
                    {/* Informasi Kontak */}
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121C11] p-5 sm:p-8 shadow-2xl">
                      <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
                        <span className="h-2 w-2 rounded-full bg-[#86A86C]" />
                        <h3 className="text-lg font-serif text-[#F6F5F0]">Data Personal Pemesan</h3>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                            Nama Lengkap
                          </label>
                          <input 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="w-full rounded-xl border border-white/15 bg-[#0B120A] px-4 py-3.5 text-sm sm:text-base font-medium text-[#F6F5F0] outline-none transition-all placeholder:text-white/30 focus:border-[#86A86C]" 
                            placeholder="Sesuai Identitas Resmi (KTP / Paspor)" 
                            required 
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                              WhatsApp Aktif
                            </label>
                            <div className="relative flex items-center">
                              <span className="absolute left-4 font-mono font-bold text-sm text-[#86A86C]">
                                +62
                              </span>
                              <input 
                                value={phone} 
                                onChange={(e) => setPhone(e.target.value)} 
                                className="w-full rounded-xl border border-white/15 bg-[#0B120A] py-3.5 pl-14 pr-4 text-sm sm:text-base font-mono font-bold text-[#F6F5F0] outline-none transition-all placeholder:text-white/30 focus:border-[#86A86C]" 
                                placeholder="81234567890" 
                                required 
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                              Alamat Email
                            </label>
                            <input 
                              type="email" 
                              value={email} 
                              onChange={(e) => setEmail(e.target.value)} 
                              className="w-full rounded-xl border border-white/15 bg-[#0B120A] px-4 py-3.5 text-sm sm:text-base font-medium text-[#F6F5F0] outline-none transition-all placeholder:text-white/30 focus:border-[#86A86C]" 
                              placeholder="nama@email.com" 
                              required 
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                              Catatan Khusus
                            </label>
                            <span className="text-[10px] font-mono uppercase text-white/40">Opsional</span>
                          </div>
                          <textarea 
                            value={specialRequest} 
                            onChange={(e) => setSpecialRequest(e.target.value)} 
                            className="h-28 w-full rounded-xl border border-white/15 bg-[#0B120A] p-4 text-sm font-medium text-[#F6F5F0] outline-none transition-all placeholder:text-white/30 focus:border-[#86A86C] resize-none leading-relaxed" 
                            placeholder="Contoh: Estimasi jam tiba malam, permohonan dekat area toilet, dll." 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Summary Minimalist for Mobile */}
                    <div className="rounded-2xl border border-white/10 bg-[#162415] p-5 sm:hidden shadow-xl text-white/80 space-y-3">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
                        <h4 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#F6F5F0]">
                          Ringkasan Reservasi
                        </h4>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-white/50 font-mono">Durasi</span>
                          <span className="font-mono tabular-nums text-white/90">{checkIn} s/d {checkOut}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/50 font-mono">Total Tamu</span>
                          <span className="font-mono tabular-nums text-white/90">{totalGuest} Orang</span>
                        </div>
                        {kavlingSelected.length > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-white/50 font-mono">Kavling</span>
                            <span className="font-mono tabular-nums text-[#86A86C] font-bold">{kavlingSelected.join(", ")}</span>
                          </div>
                        )}
                        <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                          <span className="font-mono uppercase text-[10px] text-white/50">Estimasi Total</span>
                          <span className="font-mono tabular-nums text-sm font-bold text-[#86A86C]">{formatIDR(estimatedAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="hidden lg:block">
            {sidebarContent}
          </div>
        </div>
      </div>
    )}
  </div>

{/* Sticky Navigation Bar for Step 2 & 3 - Mobile - Deep Pine Sanctuary */}
{currentStep === 2 && (
  <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/10 bg-[#090E08]/90 p-3 pb-5 backdrop-blur-xl sm:hidden shadow-2xl">
    <div className="mx-auto flex max-w-xl flex-row items-center gap-2">
      <button
        type="button"
        onClick={() => setCurrentStep(1)}
        className="flex flex-1 min-h-[3rem] items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-3 py-2 text-xs font-mono uppercase tracking-wider text-white/80 active:scale-[0.98] transition-all"
      >
        Kembali
      </button>
      <button
        type="button"
        onClick={() => setCurrentStep(3)}
        disabled={selectedVisibleCount === 0 || (requiredKavlings > 0 && kavlingSelected.length !== requiredKavlings) || guestOverCapacity}
        className="flex flex-[2.5] min-h-[3rem] items-center justify-center rounded-xl bg-[#86A86C] px-4 py-2 text-xs font-mono uppercase tracking-wider font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 active:scale-[0.98] disabled:opacity-30 transition-all"
      >
        <span>Lanjut Isi Identitas ↗</span>
      </button>
    </div>
  </div>
)}

{currentStep === 3 && (
  <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/10 bg-[#090E08]/90 p-3 pb-5 backdrop-blur-xl sm:hidden shadow-2xl">
    <div className="mx-auto flex max-w-xl flex-row items-center gap-2">
      <button
        type="button"
        onClick={() => setCurrentStep(2)}
        className="flex flex-1 min-h-[3rem] items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-3 py-2 text-xs font-mono uppercase tracking-wider text-white/80 active:scale-[0.98] transition-all"
      >
        Kembali
      </button>
      <button
        type="submit"
        form="booking-form"
        disabled={submitting || loading || !name || !phone || !email}
        className="flex flex-[2.5] min-h-[3rem] items-center justify-center rounded-xl bg-[#86A86C] px-4 py-2 text-xs font-mono uppercase tracking-wider font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 active:scale-[0.98] disabled:opacity-30 transition-all"
      >
        <span>{submitting || loading ? "Memproses..." : "Konfirmasi Booking ↗"}</span>
      </button>
    </div>
  </div>
)}

{/* Desktop Navigation for Step 2 & 3 - Hidden on mobile */}
<div className="hidden sm:block">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div className="grid grid-cols-1 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {currentStep === 2 && (
          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              disabled={selectedVisibleCount === 0 || (requiredKavlings > 0 && kavlingSelected.length !== requiredKavlings) || guestOverCapacity}
              className="order-1 flex min-h-[3.5rem] flex-[2] items-center justify-center rounded-xl bg-[#86A86C] px-8 py-3 text-xs font-mono uppercase tracking-widest font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 transition-all hover:bg-[#97ba7c] active:scale-[0.98] disabled:opacity-30 sm:order-2"
            >
              <span>Lanjut Isi Identitas ↗</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="order-2 flex min-h-[3.5rem] flex-1 items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-6 py-3 text-xs font-mono uppercase tracking-widest text-white/80 transition-all hover:bg-[#162415] hover:text-white active:scale-[0.98] sm:order-1"
            >
              Kembali
            </button>
          </div>
        )}
        {currentStep === 3 && (
          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <button 
              type="submit" 
              form="booking-form" 
              disabled={submitting || loading || !name || !phone || !email} 
              className="order-1 flex min-h-[3.5rem] flex-[2] items-center justify-center rounded-xl bg-[#86A86C] px-8 py-3 text-xs font-mono uppercase tracking-widest font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 transition-all hover:bg-[#97ba7c] active:scale-[0.98] disabled:opacity-30 sm:order-2"
            >
              <span>{submitting || loading ? "Memproses..." : "Konfirmasi Booking ↗"}</span>
            </button>
            <button 
              type="button" 
              onClick={() => setCurrentStep(2)} 
              className="order-2 flex min-h-[3.5rem] flex-1 items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-6 py-3 text-xs font-mono uppercase tracking-widest text-white/80 transition-all hover:bg-[#162415] hover:text-white active:scale-[0.98] sm:order-1"
            >
              Kembali
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
</div>

{/* Ketentuan Rimba Modal - Sanctuary Theme */}
{rulesModalOpen ? (
  <Modal
    open={rulesModalOpen}
    title="Ketentuan Rimba Woodforest Jayagiri 48"
    variant="sanctuary"
    onClose={() => setRulesModalOpen(false)}
    maxWidthClassName="max-w-2xl"
  >
    <div className="space-y-4 text-xs sm:text-sm text-white/80 leading-relaxed font-sans">
      <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
        <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">
          Waktu Operasional & Check-In
        </h4>
        <p className="text-white/70">
          Check-in dibuka mulai pukul 14:00 WIB dan batas akhir check-out pukul 12:00 WIB. Keterlambatan check-out tanpa konfirmasi dapat dikenakan biaya tambahan.
        </p>
      </div>

      <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
        <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">
          Etika Hutan Pinus & Jam Tenang
        </h4>
        <p className="text-white/70">
          Untuk menjaga ketenangan seluruh tamu di alam terbuka, jam tenang diberlakukan mulai pukul 22:00 WIB hingga 06:00 WIB. Dilarang menyalakan sound system berlebih atau membuat kegaduhan.
        </p>
      </div>

      <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
        <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">
          Keamanan Api Unggun & Sampah (Zero Waste)
        </h4>
        <p className="text-white/70">
          Api unggun hanya diizinkan pada wadah tungku api (fire pit) yang disediakan. Dilarang membuat perapian langsung di atas tanah tanpa alas. Mohon bawa kembali sampah Anda atau masukkan ke tempat sampah terpilah.
        </p>
      </div>

      <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
        <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">
          Tiket & Retribusi Perhutani
        </h4>
        <p className="text-white/70">
          Seluruh reservasi resmi melalui platform ini sudah termasuk tiket masuk kawasan hutan pinus Perhutani dan tiket penitipan kendaraan terkelola. Tidak ada pungutan liar tambahan di gerbang.
        </p>
      </div>
    </div>
  </Modal>
) : null}

{/* Deep Pine Sanctuary Footer */}
<footer className="mt-20 border-t border-white/10 bg-[#090E08] py-16">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div className="flex justify-center">
      <div className="w-full max-w-xl rounded-2xl bg-[#121C11] p-8 sm:p-10 space-y-6 text-center border border-white/10 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#86A86C]">
              Layanan Concierge 24 Jam
            </span>
          </div>
          <h4 className="text-xl font-serif text-[#F6F5F0]">
            Butuh Bantuan Reservasi?
          </h4>
          <p className="text-xs sm:text-sm text-white/60 leading-relaxed max-w-md mx-auto">
            Tim pramutamu kami siap membantu konsultasi kavling, rombongan gathering, atau rute berkendara menuju 1.620 mdpl.
          </p>
        </div>
        <a 
          href="https://wa.me/628112090808" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex min-h-[3.25rem] items-center justify-center gap-3 rounded-xl bg-[#86A86C] hover:bg-[#97ba7c] px-8 py-3.5 text-xs font-mono uppercase tracking-wider font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 transition-all active:scale-[0.98]"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
          <span>Hubungi WhatsApp Concierge</span>
        </a>
      </div>
    </div>

    <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-white/40">
      <p>
        &copy; 2026 Woodforest Jayagiri 48. 1.620 mdpl Cikole Lembang.
      </p>
      <div className="flex gap-6">
        <button type="button" onClick={() => setRulesModalOpen(true)} className="hover:text-white transition-colors">
          Ketentuan Rimba
        </button>
        <span className="text-white/20">·</span>
        <span className="text-white/40 cursor-default">Reservasi Resmi</span>
      </div>
    </div>
  </div>
</footer>
</div>
);
}
