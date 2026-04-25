"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR, formatTimeWIB } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";
import { ImageCarousel } from "@/components/ui/ImageCarousel";
import { Modal } from "@/components/ui/Modal";

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
};

type BookingDraft = {
  customer: { name: string; phone: string; email: string };
  specialRequest?: string | null;
  checkIn: string;
  checkOut: string;
  totalGuest: number;
  kavlingScope: "" | "paket" | "mandiri" | "private" | "mixed";
  kavlings: number[];
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
    <div className="inline-flex w-fit items-center gap-1.5 p-1.5 rounded-full border border-[#E8E8E1] bg-white shadow-sm group transition-all duration-500 hover:border-primary/30 hover:shadow-md relative overflow-hidden">
      {/* Subtle organic background for the stepper */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none transition-transform duration-1000 group-hover:scale-110">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
        </svg>
      </div>

      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnClass} relative z-10 flex items-center justify-center rounded-full bg-[#F1F3EE] text-[#2D3E10] transition-all hover:bg-primary hover:text-white active:scale-90 disabled:opacity-20 disabled:pointer-events-none hover:shadow-lg hover:shadow-primary/20`}
        aria-label={`Kurangi ${ariaLabel}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
      <div className={`${midClass} relative z-10 flex items-center justify-center text-center font-bold text-[#2D3E10] tabular-nums`} aria-label={ariaLabel}>
        {value}
      </div>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        className={`${btnClass} relative z-10 flex items-center justify-center rounded-full bg-[#F1F3EE] text-[#2D3E10] transition-all hover:bg-primary hover:text-white active:scale-90 disabled:opacity-20 disabled:pointer-events-none hover:shadow-lg hover:shadow-primary/20`}
        aria-label={`Tambah ${ariaLabel}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

export default function PublicBookingPage() {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const defaultCheckIn = useMemo(() => isoDate(today), [today]);
  const defaultCheckOut = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  }, [today]);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [filterType, setFilterType] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [unitPage, setUnitPage] = useState(1);

  const [currentStep, setCurrentStep] = useState(1);
  const [adultPax, setAdultPax] = useState(1);
  const [childPax, setChildPax] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [totalGuest, setTotalGuest] = useState(1);
  const [specialRequest, setSpecialRequest] = useState("");

  useEffect(() => {
    setTotalGuest(adultPax + childPax);
  }, [adultPax, childPax]);

  type QtyById = Record<string, number>;

  const [units, setUnits] = useState<AvailabilityUnit[]>([]);
  const [addons, setAddons] = useState<AvailabilityAddOn[]>([]);
  const [unitQty, setUnitQty] = useState<QtyById>({});
  const [addonQty, setAddonQty] = useState<QtyById>({});

  const [kavlingAll, setKavlingAll] = useState<number[]>([]);
  const [kavlingTaken, setKavlingTaken] = useState<number[]>([]);
  const [kavlingSelected, setKavlingSelected] = useState<number[]>([]);
  const [kavlingLoading, setKavlingLoading] = useState(false);
  const [kavlingError, setKavlingError] = useState<string | null>(null);
  const [kavlingPrivateRange, setKavlingPrivateRange] = useState<null | { start: number; end: number }>(null);
  const [kavlingSellCount, setKavlingSellCount] = useState<number | null>(null);
  const [hold, setHold] = useState<null | { id: string; token: string; expiresAt: string }>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdHeartbeat, setHoldHeartbeat] = useState(0);
  const [kavlingMapOpen, setKavlingMapOpen] = useState(false);
  const [kavlingMapHover, setKavlingMapHover] = useState(false);
  const [kavlingMapOrigin, setKavlingMapOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [kavlingMapZoom, setKavlingMapZoom] = useState(1);
  const [kavlingMapAssetVersion, setKavlingMapAssetVersion] = useState(() => Date.now());
  const kavlingMapViewportRef = useRef<HTMLDivElement | null>(null);
  const kavlingMapImgRef = useRef<HTMLImageElement | null>(null);
  const kavlingMapPinchRef = useRef<null | { startDist: number; startZoom: number }>(null);
  const kavlingMapDragRef = useRef<null | { pointerId: number; startX: number; startY: number; left: number; top: number }>(null);
  const [kavlingMapDragging, setKavlingMapDragging] = useState(false);
  const kavlingMapManualZoomRef = useRef(false);
  const kavlingMapMoveRafRef = useRef<number | null>(null);
  const kavlingMapMovePosRef = useRef<{ x: number; y: number } | null>(null);
  const [holdNow, setHoldNow] = useState(() => Date.now());

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; amount: number } | null>(null);
  const [invoice, setInvoice] = useState<PublicBookingInvoice | null>(null);
  const [packageConfigs, setPackageConfigs] = useState<Record<string, { description?: string; imageUrl?: string }>>({});
  const preserveHoldOnUnmountRef = useRef(false);
  const restoringDraftRef = useRef(false);
  const pendingKavlingRestoreRef = useRef<null | { scope: "" | "paket" | "mandiri" | "private" | "mixed"; kavlings: number[]; hold?: { id: string; token: string; expiresAt?: string } }>(null);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    const draft = readDraft();
    if (!draft) return;
    restoringDraftRef.current = true;
    setCheckIn(draft.checkIn);
    setCheckOut(draft.checkOut);
    setName(draft.customer.name);
    setPhone(draft.customer.phone);
    setEmail(draft.customer.email);
    setTotalGuest(draft.totalGuest);
    setSpecialRequest(draft.specialRequest ?? "");
    setUnitQty(Object.fromEntries(draft.items.map((it) => [it.unitId, it.quantity])));
    setAddonQty(Object.fromEntries(draft.addOns.map((a) => [a.addOnId, a.quantity])));
    pendingKavlingRestoreRef.current = {
      scope: draft.kavlingScope ?? "",
      kavlings: draft.kavlings ?? [],
      hold: draft.hold,
    };
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
        | { all?: number[]; taken?: number[]; sellCount?: number; privateRange?: { start?: number; end?: number }; message?: string }
        | null;
      if (cancelled) return;
      if (!res.ok) {
        setKavlingAll([]);
        setKavlingTaken([]);
        setKavlingLoading(false);
        setKavlingError(data?.message ?? "Gagal load kavling");
        return;
      }
      setKavlingAll((data?.all ?? []).filter((n) => typeof n === "number"));
      setKavlingTaken((data?.taken ?? []).filter((n) => typeof n === "number"));
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
    
    // During restoration, don't clear hold immediately if lengths don't match, 
    // wait for kavlingSelected to be restored.
    if (kavlingSelected.length !== requiredKavlings) {
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError(null);
      return;
    }
    if (kavlingSelected.some((n) => kavlingTaken.includes(n))) {
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError("Sebagian kavling sudah terpakai/di-hold. Silakan pilih nomor lain.");
      return;
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
      const addOnId = u.autoAddOnId ?? "";
      const mode = (u.autoAddOnMode ?? "") as "per_pax" | "per_unit" | "per_booking" | "";
      if (!addOnId || !mode) continue;
      const current = map.get(addOnId) ?? 0;
      if (mode === "per_pax") map.set(addOnId, Math.max(current, totalGuest));
      else if (mode === "per_unit") map.set(addOnId, current + qty);
      else if (mode === "per_booking") map.set(addOnId, current + 1);
    }
    return Object.fromEntries(map.entries()) as Record<string, number>;
  }, [units, unitQty, totalGuest]);

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
    () => (totalCapacity > 0 ? totalGuest > totalCapacity : false),
    [totalGuest, totalCapacity],
  );

  const selectedVisibleUnits = useMemo(() => {
    return visibleUnits.filter(u => (unitQty[u.id] || 0) > 0);
  }, [visibleUnits, unitQty]);

  const sidebarContent = (
    <div className="sticky top-6 space-y-6">
      <div className="overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white shadow-2xl shadow-[#2D3E10]/5 transition-all duration-700 hover:shadow-primary/10">
        {/* Header - Premium Nature Gradient */}
        <div className="relative overflow-hidden bg-[#2D3E10] px-8 py-12">
          <div className="relative z-10">
            <h3 className="text-2xl font-bold tracking-tight text-white">Ringkasan <span className="italic font-serif opacity-80">Pesanan</span></h3>
            <div className="mt-3 flex items-center gap-3">
              <span className="h-[1px] w-8 bg-primary/40"></span>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.4em]">Exclusive Stay</p>
            </div>
          </div>
          
          {/* Organic Background Pattern - More Subtle */}
          <div className="absolute -right-10 -top-10 h-48 w-48 opacity-[0.07] rotate-12 pointer-events-none">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path fill="#ffffff" d="M40,-67.2C51.7,-60.7,60.9,-49.5,68.1,-37.1C75.3,-24.7,80.5,-11.1,79.1,2C77.7,15.1,69.7,27.7,60.3,38.5C50.9,49.3,40.1,58.3,27.7,64.3C15.3,70.3,1.3,73.3,-13.2,71.7C-27.7,70.1,-42.7,63.9,-54.6,53.8C-66.5,43.7,-75.3,29.7,-78.7,14.6C-82.1,-0.5,-80.1,-16.7,-73.4,-30.5C-66.7,-44.3,-55.3,-55.7,-42.2,-61.5C-29.1,-67.3,-14.5,-67.5,0.4,-68.2C15.3,-68.9,30.6,-70,40,-67.2Z" transform="translate(100 100)" />
            </svg>
          </div>
        </div>
        
        <div className="p-8 space-y-12">
          {/* Jadwal & Tamu */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10]/30">Rencana Kunjungan</span>
              <button 
                onClick={() => setCurrentStep(1)} 
                className="group flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest transition-all hover:text-[#2D3E10]"
              >
                <span>Ubah</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F1F3EE] transition-colors group-hover:bg-primary group-hover:text-white">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Date */}
              <div className="flex items-start gap-5 group">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3EE] text-[#2D3E10] transition-all duration-500 group-hover:bg-primary group-hover:text-white group-hover:rotate-3 group-hover:scale-110">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1.5 py-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/40">Tanggal Menginap</span>
                  <span className="text-sm font-bold text-[#2D3E10] leading-none tracking-tight">
                    {checkIn ? formatDateWIB(new Date(checkIn)) : "Pilih Tanggal"}
                    {checkOut && <span className="mx-2 text-[#2D3E10]/20">—</span>}
                    {checkOut ? formatDateWIB(new Date(checkOut)) : ""}
                  </span>
                </div>
              </div>

              {/* Guests */}
              <div className="flex items-start gap-5 group">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3EE] text-[#2D3E10] transition-all duration-500 group-hover:bg-primary group-hover:text-white group-hover:-rotate-3 group-hover:scale-110">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-1.5 py-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/40">Jumlah Tamu</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#2D3E10] tracking-tight">{totalGuest} Orang</span>
                    <span className="text-[10px] font-medium text-primary/60 italic">({adultPax}D, {childPax}A)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Unit Terpilih */}
          <div className="space-y-8">
            <div className="border-b border-[#E8E8E1] pb-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10]/30">Akomodasi</span>
            </div>
            {selectedVisibleUnits.length > 0 ? (
              <div className="space-y-6">
                {selectedVisibleUnits.map(u => {
                  const qty = unitQty[u.id] || 0;
                  return (
                    <div key={u.id} className="group flex justify-between items-start gap-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-bold text-[#2D3E10] leading-tight group-hover:text-primary transition-colors">{u.name}</span>
                        <div className="flex items-center">
                          <span className="rounded-full bg-[#F1F3EE] px-2.5 py-0.5 text-[9px] font-bold text-[#2D3E10]/60 uppercase tracking-wider">
                            {qty} Unit
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-black text-[#2D3E10] tabular-nums tracking-tight">{formatIDR(sumDailyPrice(u) * qty)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center rounded-[2rem] border-2 border-dashed border-[#E8E8E1] bg-[#F1F3EE]/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#2D3E10]/20 shadow-sm border border-[#E8E8E1] mb-4">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-[10px] font-bold text-[#2D3E10]/30 uppercase tracking-[0.2em]">Belum Ada Pilihan</p>
              </div>
            )}
          </div>

          {/* Add-ons if any */}
          {Object.keys(addonQty).some(id => addonQty[id] > 0) && (
            <div className="space-y-8">
              <div className="border-b border-[#E8E8E1] pb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10]/30">Layanan Tambahan</span>
              </div>
              <div className="space-y-6">
                {addons.filter(a => addonQty[a.id] > 0).map(a => (
                  <div key={a.id} className="group flex justify-between items-start gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-[#2D3E10] leading-tight group-hover:text-primary transition-colors">{a.name}</span>
                      <span className="text-[9px] font-bold text-[#2D3E10]/40 uppercase tracking-widest">Qty: {addonQty[a.id]}</span>
                    </div>
                    <span className="text-sm font-black text-[#2D3E10] tabular-nums tracking-tight">{formatIDR(a.price * addonQty[a.id])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Footer */}
          <div className="pt-4">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-[#F1F3EE] p-10 space-y-6 group">
              {/* Organic Accent in Footer - Very Subtle */}
              <div className="absolute -left-6 -bottom-6 h-32 w-32 opacity-[0.05] -rotate-12 transition-transform duration-1000 group-hover:rotate-0 group-hover:scale-110">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#2D3E10" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.3,88.5,-0.9C87,14.5,81.4,29,72.6,41.4C63.8,53.8,51.8,64,38.3,71.2C24.8,78.4,9.8,82.6,-5.3,81.8C-20.4,81,-35.5,75.2,-48.6,66.3C-61.7,57.4,-72.8,45.4,-78.9,31.5C-85,17.6,-86.1,1.8,-83.4,-13.4C-80.7,-28.6,-74.2,-43.1,-63.4,-53.4C-52.6,-63.7,-37.5,-69.8,-23.4,-77C-9.3,-84.2,3.8,-92.5,44.7,-76.4Z" transform="translate(100 100)" />
                </svg>
              </div>

              <div className="relative z-10 space-y-3 text-center">
                <span className="text-[10px] font-bold text-[#2D3E10]/40 uppercase tracking-[0.4em]">Estimasi Total Biaya</span>
                <div className="flex flex-col gap-1">
                  <span className="text-3xl font-black text-[#2D3E10] tracking-tighter tabular-nums">{formatIDR(estimatedAmount)}</span>
                  <p className="text-[10px] font-medium text-primary/40 italic">
                    *Termasuk pajak & biaya layanan
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button Section */}
        <div className="bg-white px-8 pb-10 pt-4 border-t border-[#E8E8E1]/60">
          <button
            onClick={() => {
              if (currentStep === 1) setCurrentStep(2);
              else if (currentStep === 2) setCurrentStep(3);
              else onSubmit(new Event('submit') as any);
            }}
            disabled={(currentStep === 1 && !filterCategory) || (currentStep === 2 && (!name || !phone || !email || !checkIn || !checkOut)) || (currentStep === 3 && selectedVisibleCount === 0)}
            className="group relative w-full overflow-hidden rounded-[1.2rem] bg-[#2D3E10] py-5 text-[11px] font-bold text-white shadow-xl shadow-[#2D3E10]/20 transition-all hover:bg-[#3D5216] hover:-translate-y-1 active:scale-[0.98] disabled:opacity-20 disabled:pointer-events-none"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            <div className="relative z-10 flex items-center justify-center gap-4 uppercase tracking-[0.3em]">
              <span>{currentStep === 1 ? "Lanjut Isi Data" : currentStep === 2 ? "Lanjut Pilih Unit" : "Konfirmasi Booking"}</span>
              <svg className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Trust Badge - More Elegant */}
      <div className="flex items-center gap-5 px-10 py-8 rounded-[2.5rem] bg-[#F1F3EE]/30 border border-[#E8E8E1] group transition-all duration-500 hover:bg-white hover:shadow-xl hover:shadow-[#2D3E10]/5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm transition-transform duration-700 group-hover:rotate-[360deg]">
          <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="space-y-0.5">
          <span className="block text-[10px] font-black text-[#2D3E10] uppercase tracking-[0.3em]">Secure Stay</span>
          <span className="block text-[9px] font-medium text-primary/40 uppercase tracking-widest">Premium Protected Reservation</span>
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
    <div className="relative min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
      {/* Premium Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -left-1/4 -top-1/4 h-[100%] w-[100%] rounded-full bg-primary/[0.03] blur-[120px] animate-pulse" />
        <div className="absolute -right-1/4 -bottom-1/4 h-[100%] w-[100%] rounded-full bg-primary/[0.02] blur-[120px] animate-pulse duration-[10000ms]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className={`${success ? "no-print " : ""}mb-8 overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white p-8 shadow-2xl shadow-[#2D3E10]/5 backdrop-blur-xl transition-all hover:shadow-primary/10`}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <div className="relative group">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <img src="/brand/logowf.png" alt="Woodforest" className="relative h-24 w-24 shrink-0 rounded-2xl object-contain sm:h-36 sm:w-36 transition-transform duration-700 group-hover:scale-105" />
              </div>
            </div>
            <div className="sm:-mt-2">
              <div className="inline-flex items-center rounded-full bg-primary/10 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-primary mb-3">
                <span className="relative flex h-2 w-2 mr-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Luxury Camping Ground
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-[#2D3E10] sm:text-5xl">
                Woodforest <span className="text-primary italic">Booking</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-primary/60 italic">
                "Grounded, calm, warm. Pilih tanggal, pilih paket, dan nikmati pengalaman yang tenang di alam untuk bonding keluarga."
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {["Quiet nature", "Family bonding", "Wellness", "Light adventure"].map((tag) => (
                  <div key={tag} className="rounded-2xl border border-[#E8E8E1] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/40 transition-all hover:border-primary/40 hover:text-primary hover:-translate-y-0.5">
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

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
                    <img src="/brand/logowf.png" alt="Woodforest" className="print-logo mx-auto h-32 w-32 object-contain" />
                    <div className="mt-4 text-xl font-bold tracking-tight text-[#2D3E10]">Woodforest <span className="italic font-serif opacity-60">Jayagiri 48</span></div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10]/30">Quiet nature • Family bonding • Wellness • Light adventure</div>
                    <div className="mt-4 text-[11px] font-medium text-[#2D3E10]/40">admin@woodforestjayagiri48.com · +62 811-2090-808</div>
                    <div className="mt-1 text-[10px] font-medium text-[#2D3E10]/40">Jam check-in 14:00 WIB • Check-out 12:00 WIB</div>
                  </div>

                  <div className="my-8 h-px bg-[#E8E8E1]" />

                  {invoice ? (
                    <>
                      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-3">
                          <div className="inline-flex rounded-full bg-[#F1F3EE] px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/60">Invoice / Confirmation</div>
                          <div className="text-sm font-bold text-[#2D3E10]">Dear {invoice.customer.name},</div>
                          <p className="max-w-xs text-xs leading-relaxed text-[#2D3E10]/50">Terima kasih telah memilih Woodforest Jayagiri 48. Berikut adalah detail konfirmasi booking Anda.</p>
                        </div>
                        <div className="flex flex-col gap-4 md:text-right">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/30">Booking ID</div>
                            <div className="mt-1 font-mono text-sm font-bold text-[#2D3E10]">{invoice.code}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/30">Status</div>
                            <div className="mt-1">
                              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                                invoice.payment.paidAmount >= invoice.payment.amount 
                                  ? "bg-green-50 text-green-600" 
                                  : "bg-amber-50 text-amber-600"
                              }`}>
                                {invoice.payment.paidAmount >= invoice.payment.amount ? "Confirmed" : "Pending"}
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
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/30 mb-4">Add-Ons</div>
                              <div className="space-y-3">
                                {invoice.addOns.map((a, idx) => (
                                  <div key={`${a.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                    <div className="text-[#2D3E10]">
                                      {a.name} <span className="ml-1 text-[10px] font-bold text-[#2D3E10]/30">({formatIDR(a.price)})</span>
                                    </div>
                                    <div className="font-mono text-[#2D3E10]/60">x{a.quantity}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-8 pt-6 border-t border-[#E8E8E1]">
                            <div className="grid grid-cols-2 gap-y-4 text-xs">
                              <div className="text-[#2D3E10]/40">Check-in</div>
                              <div className="text-right font-bold text-[#2D3E10]">{formatDateWIB(new Date(invoice.checkIn))}</div>
                              <div className="text-[#2D3E10]/40">Check-out</div>
                              <div className="text-right font-bold text-[#2D3E10]">{formatDateWIB(new Date(invoice.checkOut))}</div>
                              <div className="text-[#2D3E10]/40">Guest</div>
                              <div className="text-right font-bold text-[#2D3E10]">{invoice.totalGuest} Tamu</div>
                              <div className="text-[#2D3E10]/40">Kavling</div>
                              <div className="text-right font-mono font-bold text-[#2D3E10]">
                                {invoice.kavlings?.length ? invoice.kavlings.slice().sort((a, b) => a - b).join(", ") : "-"}
                              </div>
                            </div>
                          </div>

                          {invoice.specialRequest ? (
                            <div className="mt-6 pt-6 border-t border-[#E8E8E1]">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/30 mb-2">Special Request</div>
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
                                  <div className="text-[#2D3E10]/40">Room / Paket</div>
                                  <div className="font-bold text-[#2D3E10]">{formatIDR(baseAmount)}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[#2D3E10]/40">Add-Ons</div>
                                  <div className="font-bold text-[#2D3E10]">{formatIDR(addOnAmount)}</div>
                                </div>
                                <div className="my-4 h-px bg-[#E8E8E1]" />
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <div className="font-bold text-[#2D3E10]">Total</div>
                                  <div className="text-lg font-bold text-primary">{formatIDR(invoice.payment.amount)}</div>
                                </div>
                                <div className="mt-8 space-y-3 rounded-xl bg-[#F1F3EE]/50 p-4">
                                  <div className="flex items-center justify-between text-[10px]">
                                    <div className="font-bold uppercase tracking-widest text-[#2D3E10]/30">Method</div>
                                    <div className="font-bold text-[#2D3E10]">{invoice.payment.method ?? "-"}</div>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px]">
                                    <div className="font-bold uppercase tracking-widest text-[#2D3E10]/30">Amount Paid</div>
                                    <div className="font-bold text-[#2D3E10]">{formatIDR(invoice.payment.paidAmount)}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="print-hide mt-8 rounded-xl bg-[#F1F3EE] p-4 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/40">
                          Simpan halaman ini sebagai bukti booking. Tunjukkan Booking ID saat check-in.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-[#2D3E10]/30">Menyiapkan invoice...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="no-print mt-8 flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="group relative flex h-14 flex-1 items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#2D3E10] px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] hover:-translate-y-1 active:scale-[0.98] disabled:opacity-50"
                  disabled={!invoice}
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Unduh E-Voucher / Cetak
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem("wf_booking_draft");
                    window.location.href = window.location.pathname;
                  }}
                  className="group flex h-14 flex-1 items-center justify-center rounded-[1.2rem] border border-[#E8E8E1] bg-white px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-[0.98]"
                >
                  Booking Lagi
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-12 space-y-12 pb-20">
            {/* Global Progress Steps - Standardized with Confirmation Page */}
            <div className="mb-16">
              <div className="flex items-center justify-center gap-3">
                {[
                  { id: 1, label: "Pilih", active: true, completed: false },
                  { id: 2, label: "Konfirmasi", active: false, completed: false },
                  { id: 3, label: "Bayar", active: false, completed: false }
                ].map((step, idx) => (
                  <div key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition-all duration-500 ${
                        step.active 
                          ? "border-primary bg-primary text-white shadow-xl shadow-primary/20 scale-105" 
                          : step.completed 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-[#E8E8E1] bg-white text-[#2D3E10]/20"
                      }`}>
                        {step.completed ? (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-sm font-black tracking-tight">{step.id}</span>
                        )}
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${
                        step.active ? "text-primary" : step.completed ? "text-[#2D3E10]" : "text-[#2D3E10]/20"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < 2 && (
                      <div className="mx-4 mb-6 h-px w-8 bg-[#E8E8E1]" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Indicators - Modern & Professional */}
            <div className="mx-auto max-w-4xl px-4">
              <div className="relative flex items-center justify-between gap-4">
                {[1, 2, 3].map((step) => {
                  const isActive = currentStep === step;
                  const isCompleted = currentStep > step;
                  const labels = ["Pilih Paket", "Detail Tamu", "Pilihan Unit"];
                  
                  return (
                    <div key={step} className="relative flex flex-1 flex-col items-center group">
                      <button 
                        type="button"
                        onClick={() => {
                          if (isCompleted || (step < currentStep)) setCurrentStep(step);
                        }}
                        disabled={!isCompleted && step > currentStep}
                        className="flex flex-col items-center gap-2 outline-none w-full"
                      >
                        {/* Line connector */}
                        {step < 3 && (
                          <div className="absolute left-[calc(50%+20px)] right-[-calc(50%-20px)] top-5 h-[2px] bg-[#E8E8E1]">
                            <div 
                              className="h-full bg-primary transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1)" 
                              style={{ width: isCompleted ? "100%" : "0%" }}
                            />
                            {/* Organic leaf-like dot on the line */}
                            <div 
                              className={`absolute -top-1 h-2 w-2 rounded-full border border-white bg-primary transition-all duration-1000 ${
                                isCompleted ? "left-full opacity-100" : "left-0 opacity-0"
                              }`}
                            />
                          </div>
                        )}

                        <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition-all duration-700 ${
                          isActive 
                            ? "border-primary bg-primary text-white shadow-xl shadow-primary/20 scale-110 rotate-3" 
                            : isCompleted 
                              ? "border-primary bg-primary/10 text-primary" 
                              : "border-[#E8E8E1] bg-white text-[#2D3E10]/20"
                        }`}>
                          {/* Active Step Decoration */}
                          {isActive && (
                            <div className="absolute -inset-2 opacity-20 animate-spin-slow">
                              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                <path fill="currentColor" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.3,88.5,-0.9C87,14.5,81.4,29,72.6,41.4C63.8,53.8,51.8,64,38.3,71.2C24.8,78.4,9.8,82.6,-5.3,81.8C-20.4,81,-35.5,75.2,-48.6,66.3C-61.7,57.4,-72.8,45.4,-78.9,31.5C-85,17.6,-86.1,1.8,-83.4,-13.4C-80.7,-28.6,-74.2,-43.1,-63.4,-53.4C-52.6,-63.7,-37.5,-69.8,-23.4,-77C-9.3,-84.2,3.8,-92.5,44.7,-76.4Z" transform="translate(100 100)" />
                              </svg>
                            </div>
                          )}
                          
                          {isCompleted ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-sm font-black tracking-tight relative z-10">{step}</span>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-center text-center">
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${
                            isActive ? "text-primary" : isCompleted ? "text-[#2D3E10]" : "text-[#2D3E10]/20"
                          }`}>
                            Langkah {step}
                          </span>
                          <span className={`text-xs font-bold transition-colors duration-300 ${
                            isActive ? "text-[#2D3E10]" : isCompleted ? "text-[#2D3E10]/70" : "text-[#2D3E10]/20"
                          }`}>
                            {labels[step-1]}
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative mt-8 mx-auto max-w-7xl">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
                {/* Main Content Area */}
                <div className="space-y-8">
                  {currentStep === 1 && (
                    <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 cubic-bezier(0.16, 1, 0.3, 1) fill-mode-both">
                      <div className="mb-12 text-center">
                        <div className="inline-flex items-center rounded-full bg-[#F1F3EE] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10] mb-6 border border-[#E8E8E1]">
                          Langkah 01
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-[#2D3E10] sm:text-5xl">
                          Pilih <span className="text-primary italic">Pengalaman</span> Anda
                        </h2>
                        <p className="mx-auto mt-4 max-w-xl text-sm font-medium text-primary/60 italic">
                          "Temukan harmoni sempurna antara kemewahan modern dan keasrian alam Jayagiri. Pilih kategori yang paling sesuai dengan rencana liburan Anda."
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                        {categoryOptions.map((cat, idx) => {
                          const isGlamping = cat.toLowerCase().includes('glamp');
                          const isPaket = cat.toLowerCase().includes('paket');
                          const isPrivate = cat.toLowerCase().includes('private');
                          
                          return (
                            <div
                              key={cat}
                              className="group relative flex flex-col h-full"
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
                                className={`flex flex-col h-full overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] transition-all duration-700 hover:shadow-[0_32px_64px_-16px_rgba(45,62,16,0.1)] hover:-translate-y-2 ${
                                  filterCategory === cat 
                                    ? "border-primary bg-white shadow-2xl shadow-primary/5" 
                                    : "bg-white hover:border-primary/40"
                                }`}
                              >
                                {/* Subtle Organic Decoration for Category Card */}
                                <div className="absolute -right-12 -top-12 h-48 w-48 opacity-[0.03] transition-transform duration-1000 group-hover:scale-125 group-hover:rotate-12 pointer-events-none">
                                  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                                  </svg>
                                </div>
                                
                                <div className="relative h-56 w-full overflow-hidden">
                                  {packageConfigs[cat]?.imageUrl ? (
                                    <img 
                                      src={`${packageConfigs[cat].imageUrl}?t=${Date.now()}`} 
                                      alt={cat} 
                                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                                    />
                                  ) : (
                                    <div className={`absolute inset-0 bg-gradient-to-br transition-transform duration-1000 group-hover:scale-110 ${
                                      isGlamping ? "from-[#F1F3EE] to-[#E8E8E1]" : 
                                      isPrivate ? "from-[#FDFDFB] to-[#F1F3EE]" : 
                                      "from-[#E8E8E1] to-[#F1F3EE]"
                                    }`} />
                                  )}
                                  
                                  {/* Organic SVG Overlay */}
                                  <div className="absolute inset-0 flex items-center justify-center opacity-5 mix-blend-multiply transition-opacity group-hover:opacity-10">
                                    <svg className="w-64 h-64" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                      <path fill="#2D3E10" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.3,88.5,-0.9C87,14.5,81.4,29,72.6,41.4C63.8,53.8,51.8,64,38.3,71.2C24.8,78.4,9.8,82.6,-5.3,81.8C-20.4,81,-35.5,75.2,-48.6,66.3C-61.7,57.4,-72.8,45.4,-78.9,31.5C-85,17.6,-86.1,1.8,-83.4,-13.4C-80.7,-28.6,-74.2,-43.1,-63.4,-53.4C-52.6,-63.7,-37.5,-69.8,-23.4,-77C-9.3,-84.2,3.8,-92.5,44.7,-76.4Z" transform="translate(100 100)" />
                                    </svg>
                                  </div>

                                  <div className={`absolute top-6 left-6 flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-700 ${
                                    filterCategory === cat ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-white/90 backdrop-blur-md text-[#2D3E10] group-hover:bg-primary group-hover:text-white"
                                  }`}>
                                    {isGlamping ? (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.5 21 12 3l8.5 18M12 3v18M9 21l3-5 3 5" />
                                      </svg>
                                    ) : isPrivate ? (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                      </svg>
                                    ) : (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col flex-1 p-8 text-left">
                                  <h3 className="text-2xl font-bold text-[#2D3E10] mb-3 group-hover:text-primary transition-colors">{cat}</h3>
                                  <p className="text-sm font-medium leading-relaxed text-primary/60 mb-8 flex-1 italic">
                                    {packageConfigs[cat]?.description || (
                                      cat === "Glamping" ? "Nikmati kemewahan berkemah dengan fasilitas lengkap di tengah rimbunnya hutan Jayagiri yang menenangkan." : 
                                      cat === "Paket" ? "Pilihan paket lengkap yang dirancang khusus untuk menciptakan momen berharga bersama keluarga tercinta." :
                                      "Pengalaman eksklusif dengan privasi tinggi untuk momen spesial Anda bersama orang terdekat di alam terbuka."
                                    )}
                                  </p>

                                  <div className="flex items-center justify-between pt-6 border-t border-[#E8E8E1]">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]">Eksplorasi Detail</span>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3EE] text-[#2D3E10] transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:translate-x-1">
                                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                      </svg>
                                    </div>
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
              <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 cubic-bezier(0.16, 1, 0.3, 1) fill-mode-both">
                <div className="mb-12 text-center">
                  <div className="inline-flex items-center rounded-full bg-[#F1F3EE] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10] mb-6 border border-[#E8E8E1]">
                    Langkah 02
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-[#2D3E10] sm:text-5xl">
                    Detail <span className="text-primary italic">Menginap</span>
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-sm font-medium text-primary/60 italic">
                    "Kenyamanan Anda adalah prioritas kami. Silakan lengkapi detail rencana menginap Anda untuk pengalaman yang tak terlupakan."
                  </p>
                </div>

                <div className="mx-auto w-full">
                  <form onSubmit={(e) => { e.preventDefault(); setCurrentStep(3); }} className="space-y-8">
                    <div className="space-y-12">
                      {/* Section: Stay Details */}
                      <div className="space-y-6 relative group">
                        {/* Organic Decoration for Section Header */}
                        <div className="absolute -left-12 -top-12 h-32 w-32 opacity-[0.03] transition-transform duration-1000 group-hover:scale-125 group-hover:-rotate-12 pointer-events-none">
                          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                          </svg>
                        </div>
                        
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F1F3EE] text-[#2D3E10] shadow-sm">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold tracking-tight text-[#2D3E10]">Detail Menginap</h3>
                        </div>

                        <div className="overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white p-10 shadow-xl shadow-[#2D3E10]/5 relative group/card">
                          {/* Organic Background Decoration for Date Picker Area */}
                          <div className="absolute -right-24 -bottom-24 h-64 w-64 opacity-[0.02] transition-transform duration-1000 group-hover/card:scale-110 group-hover/card:-rotate-12 pointer-events-none">
                            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                              <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                            </svg>
                          </div>

                          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 relative z-10">
                            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                              <div className="flex items-center gap-2 ml-1">
                                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Tanggal Check-in</label>
                              </div>
                              <input
                                type="date"
                                value={checkIn}
                                onChange={(e) => {
                                  if (checkIn !== e.target.value) {
                                    resetSelection();
                                  }
                                  setCheckIn(e.target.value);
                                }}
                                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                                required
                              />
                            </div>
                            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                              <div className="flex items-center gap-2 ml-1">
                                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Tanggal Check-out</label>
                              </div>
                              <input
                                type="date"
                                value={checkOut}
                                onChange={(e) => {
                                  if (checkOut !== e.target.value) {
                                    resetSelection();
                                  }
                                  setCheckOut(e.target.value);
                                }}
                                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                                required
                              />
                            </div>
                          </div>

                          <div className="mt-12 space-y-6 pt-10 border-t border-[#E8E8E1]/60">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/40 ml-1">Konfigurasi Tamu</label>
                            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                              <div className="flex items-center justify-between rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md">
                                <div className="space-y-1">
                                  <p className="text-base font-bold text-[#2D3E10]">Dewasa</p>
                                  <p className="text-[10px] font-medium text-primary/60 italic tracking-wide">Usia di atas 12 tahun</p>
                                </div>
                                <QuantityStepper 
                                  value={adultPax} 
                                  min={1} 
                                  ariaLabel="Dewasa" 
                                  onChange={setAdultPax} 
                                />
                              </div>
                              <div className="flex items-center justify-between rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md">
                                <div className="space-y-1">
                                  <p className="text-base font-bold text-[#2D3E10]">Anak-anak</p>
                                  <p className="text-[10px] font-medium text-primary/60 italic tracking-wide">Usia di bawah 12 tahun</p>
                                </div>
                                <QuantityStepper 
                                  value={childPax} 
                                  min={0} 
                                  ariaLabel="Anak" 
                                  onChange={setChildPax} 
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section: Contact Info */}
                      <div className="space-y-6 relative group">
                        {/* Organic Decoration for Section Header */}
                        <div className="absolute -right-12 -top-12 h-32 w-32 opacity-[0.03] transition-transform duration-1000 group-hover:scale-125 group-hover:rotate-12 pointer-events-none">
                          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                          </svg>
                        </div>
                        
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F1F3EE] text-[#2D3E10] shadow-sm">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold tracking-tight text-[#2D3E10]">Informasi Kontak</h3>
                        </div>

                        <div className="overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white p-10 shadow-xl shadow-[#2D3E10]/5 space-y-10 relative group/card">
                          {/* Organic Background Decoration for Contact Info Area */}
                          <div className="absolute -left-24 -bottom-24 h-64 w-64 opacity-[0.02] transition-transform duration-1000 group-hover/card:scale-110 group-hover/card:rotate-12 pointer-events-none">
                            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                              <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                            </svg>
                          </div>

                          <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 relative z-10">
                            <div className="flex items-center gap-2 ml-1">
                              <svg className="h-3.5 w-3.5 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Nama Lengkap Sesuai Identitas</label>
                            </div>
                            <input
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                              placeholder="Contoh: Budi Santoso"
                              required
                            />
                          </div>
                          
                          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
                            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                              <div className="flex items-center gap-2 ml-1">
                                <svg className="h-3.5 w-3.5 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Nomor WhatsApp</label>
                              </div>
                              <div className="mt-2 flex items-center">
                                <span className="text-base font-bold text-primary mr-2">+62</span>
                                <input
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  className="w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                                  placeholder="8123456789"
                                  required
                                />
                              </div>
                            </div>
                            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                              <div className="flex items-center gap-2 ml-1">
                                <svg className="h-3.5 w-3.5 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Alamat Email Aktif</label>
                              </div>
                              <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                                placeholder="nama@email.com"
                                required
                              />
                            </div>
                          </div>

                          <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                            <div className="flex items-center gap-2 ml-1">
                              <svg className="h-3.5 w-3.5 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Permintaan Khusus atau Catatan Tambahan</label>
                            </div>
                            <textarea
                              value={specialRequest}
                              onChange={(e) => setSpecialRequest(e.target.value)}
                              className="mt-3 h-32 w-full bg-transparent text-base font-medium text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20 resize-none leading-relaxed"
                              placeholder="Contoh: Request lokasi dekat parkir, check-in lebih awal, atau perayaan ulang tahun."
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-5 pt-12 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="group order-2 flex h-16 flex-1 items-center justify-center rounded-[1.2rem] border border-[#E8E8E1] bg-white px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-[0.98] sm:order-1"
                      >
                        <svg className="mr-3 h-4 w-4 text-primary transition-transform duration-500 group-hover:-translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Kembali
                      </button>
                      <button
                        type="submit"
                        disabled={!name || !phone || !email || !checkIn || !checkOut}
                        className="group relative order-1 flex h-16 flex-[2] items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#2D3E10] px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] hover:-translate-y-1 active:scale-[0.98] disabled:opacity-30 disabled:shadow-none sm:order-2"
                      >
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                        <span className="relative z-10">Lanjut Pilih Unit & Kavling</span>
                        <svg className="relative z-10 ml-3 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {currentStep === 3 ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit(e);
                }}
                className="relative z-10"
              >
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 cubic-bezier(0.16, 1, 0.3, 1) fill-mode-both">
                  <div className="mb-12 text-center relative group">
                    {/* Organic Decoration for Step 3 Header */}
                    <div className="absolute -left-16 -top-16 h-64 w-64 opacity-[0.03] transition-transform duration-1000 group-hover:scale-110 group-hover:-rotate-12 pointer-events-none">
                      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                      </svg>
                    </div>

                    <div className="inline-flex items-center rounded-full bg-[#F1F3EE] px-5 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D3E10] mb-6 border border-[#E8E8E1] relative z-10">
                      Langkah 03
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-[#2D3E10] sm:text-5xl relative z-10">
                      Pilihan <span className="text-primary italic">Unit & Kavling</span>
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-sm font-medium text-primary/60 italic relative z-10">
                      "Tentukan unit dan lokasi kavling favorit Anda untuk pengalaman menginap yang tak terlupakan."
                    </p>
                  </div>

                  <div className="mx-auto w-full space-y-8">
                    <div className="mb-8 flex flex-col items-center justify-between gap-5 rounded-[2.5rem] border border-[#E8E8E1] bg-[#F1F3EE]/30 p-5 backdrop-blur-xl shadow-sm sm:flex-row sm:p-6 relative group/filter overflow-hidden">
                      {/* Subtle organic decoration for filter bar */}
                      <div className="absolute -right-12 -bottom-12 h-40 w-40 opacity-[0.02] transition-transform duration-1000 group-hover/filter:scale-125 group-hover/filter:rotate-12 pointer-events-none">
                        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                          <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                        </svg>
                      </div>

                      <div className="flex items-center gap-4 relative z-10">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F1F3EE] text-primary transition-transform group-hover/filter:rotate-6">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/40">Kategori</p>
                          <p className="text-sm font-bold text-[#2D3E10]">{filterCategory || "Semua Paket"}</p>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-[#E8E8E1] hidden sm:block relative z-10" />

                      <div className="flex items-center gap-4 relative z-10">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F1F3EE] text-primary transition-transform group-hover/filter:-rotate-6">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/40">Jadwal</p>
                          <p className="text-sm font-bold text-[#2D3E10]">{checkIn} - {checkOut}</p>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-[#E8E8E1] hidden sm:block relative z-10" />

                      <div className="relative group w-full sm:w-auto z-10">
                        <select
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="h-12 w-full appearance-none rounded-2xl border border-[#E8E8E1] bg-white pl-5 pr-12 text-xs font-bold text-[#2D3E10] outline-none transition-all group-hover:border-primary focus:border-primary focus:ring-4 focus:ring-primary/5 sm:w-44"
                        >
                          <option value="">Semua Tipe</option>
                          {typeOptions.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none transition-transform group-hover:translate-y-[-40%]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                
                {/* Unit Grid */}
                <div className="grid grid-cols-1 gap-6">
                  {pagedVisibleUnits.map((u, idx) => {
                    const inc = parseIncludesJson(u.includesJson);
                    const images = parseImagesJson(u.imagesJson);
                    const facilities = parseFacilitiesJson(u.facilitiesJson);
                    const isSelected = (unitQty[u.id] ?? 0) > 0;
                    
                    return (
                      <div 
                        key={u.id} 
                        className={`group flex flex-col overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white transition-all duration-500 ${
                          isSelected 
                            ? "ring-2 ring-primary border-transparent shadow-2xl shadow-primary/5" 
                            : "hover:border-primary/40 hover:shadow-xl"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row">
                          {/* Image Section */}
                          <div className="relative aspect-[16/10] lg:aspect-auto lg:w-2/5 overflow-hidden">
                            <ImageCarousel images={images} heightClassName="h-full" />
                            {u.available <= 0 && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                                <span className="rounded-full bg-destructive/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-destructive">Penuh</span>
                              </div>
                            )}
                            <div className="absolute left-6 top-6">
                              <div className="rounded-xl bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#2D3E10] backdrop-blur-md shadow-sm">
                                {u.type}
                              </div>
                            </div>
                          </div>
                          
                          {/* Content Section */}
                          <div className="flex flex-1 flex-col p-6 lg:p-8 relative">
                            {/* Organic Decoration for Unit Card */}
                            <div className="absolute -right-12 -bottom-12 h-48 w-48 opacity-[0.02] transition-transform duration-1000 group-hover:scale-125 group-hover:rotate-12 pointer-events-none">
                              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                              </svg>
                            </div>
                            
                            <div className="flex items-start justify-between gap-4 relative z-10">
                              <div className="space-y-2 group/title">
                                <h3 className="text-xl font-black leading-tight text-[#2D3E10] transition-all duration-300 group-hover/title:translate-x-1 flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 -ml-3 transition-all duration-300 group-hover/title:opacity-100 group-hover/title:ml-0" />
                                  {u.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="flex items-center rounded-lg bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary/70 transition-colors group-hover:bg-primary/10">
                                    <svg className="mr-1.5 h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    {u.capacity} Tamu
                                  </span>
                                  <span className={`flex items-center rounded-lg px-2 py-1 text-[10px] font-bold transition-all duration-300 ${u.available > 2 ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'}`}>
                                    <span className="relative flex h-2 w-2 mr-2">
                                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${u.available > 2 ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                                      <span className={`relative inline-flex rounded-full h-2 w-2 ${u.available > 2 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                    </span>
                                    Sisa {u.available} Unit
                                  </span>
                                </div>
                              </div>
                              <QuantityStepper
                                value={unitQty[u.id] ?? 0}
                                min={0}
                                max={u.available}
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

                            {u.description && (
                              <p className="mt-6 text-sm font-medium leading-relaxed text-primary/60 line-clamp-2">{u.description}</p>
                            )}

                            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-[#E8E8E1]/60 pt-8">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Per Malam</p>
                                <p className="text-lg font-black text-[#2D3E10]">{priceRangeLabel(u)}</p>
                              </div>
                              <div className="space-y-1 text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Total Menginap</p>
                                <p className="text-xl font-black text-primary italic">{formatIDR(sumDailyPrice(u))}</p>
                              </div>
                            </div>

                            {inc.length > 0 && (
                              <div className="mt-8 rounded-[1.5rem] bg-[#F1F3EE]/50 p-6 border border-[#E8E8E1]/40 relative overflow-hidden group/inc">
                                <div className="absolute -right-4 -top-4 h-16 w-16 opacity-[0.05] transition-transform duration-700 group-hover/inc:scale-125 group-hover/inc:-rotate-12">
                                  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                                  </svg>
                                </div>
                                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary/40">Fasilitas Termasuk</p>
                                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 relative z-10">
                                  {inc.slice(0, 4).map((t, idx) => (
                                    <li key={idx} className="flex items-center text-[10px] font-bold text-[#2D3E10] group/item">
                                      <div className="mr-3 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm border border-[#E8E8E1] transition-transform group-hover/item:scale-110">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                      <span className="transition-colors group-hover/item:text-primary">{t}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
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
                    className="group relative flex items-center gap-4 rounded-[2rem] border border-[#E8E8E1] bg-white px-12 py-5 text-[11px] font-bold uppercase tracking-[0.25em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-[0.98] shadow-sm hover:shadow-xl hover:shadow-[#2D3E10]/5 overflow-hidden"
                  >
                    {/* Subtle leaf icon for the button */}
                    <div className="absolute -left-4 -top-4 h-12 w-12 opacity-0 transition-all duration-700 group-hover:opacity-10 group-hover:scale-110 group-hover:rotate-12">
                      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                      </svg>
                    </div>

                    <span className="relative z-10">Lihat Lebih Banyak Unit</span>
                    <svg className="relative z-10 h-4 w-4 text-primary transition-transform duration-700 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Kavling Selection Section */}
              {(effectiveKavlingScope || kavlingAmbiguous) && requiredKavlings > 0 && (
                <div className="overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-white shadow-2xl shadow-[#2D3E10]/5 transition-all duration-700 hover:shadow-primary/10">
                  <div className="border-b border-[#E8E8E1] bg-[#F1F3EE]/30 px-8 py-8 relative group overflow-hidden">
                    {/* Organic Decoration for Kavling Selection Header */}
                    <div className="absolute -left-16 -top-16 h-64 w-64 opacity-[0.03] transition-transform duration-1000 group-hover:scale-125 group-hover:rotate-12 pointer-events-none">
                      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                      </svg>
                    </div>
                    
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="relative group/icon">
                          <div className="absolute inset-0 bg-primary/20 rounded-[1.25rem] blur-xl opacity-0 group-hover/icon:opacity-100 transition-opacity duration-700" />
                          <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-[#2D3E10] text-white shadow-lg shadow-[#2D3E10]/20 transition-transform duration-500 group-hover/icon:scale-110 group-hover/icon:-rotate-3">
                            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A2 2 0 013 15.483V5.517a2 2 0 011.553-1.943L9 2l6 3 5.447-2.724A2 2 0 0121 4.224v9.966a2 2 0 01-1.553 1.943L15 19l-6 1z" />
                            </svg>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-2xl font-bold tracking-tight text-[#2D3E10]">Pilih Lokasi <span className="italic text-primary">Kavling</span></h3>
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
                            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-[0.2em]">Tentukan titik camping favorit Anda</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 bg-white/50 backdrop-blur-md rounded-2xl p-3 border border-white/60 shadow-sm transition-all hover:shadow-md hover:border-primary/20 group/progress">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/40">Progres Pemilihan</span>
                          <span className="text-base font-black text-[#2D3E10] tracking-tighter tabular-nums">
                            {kavlingSelected.length} <span className="text-primary/40">/</span> {requiredKavlings} <span className="text-[10px] font-bold text-primary/40 uppercase ml-1">Kavling</span>
                          </span>
                        </div>
                        <div className="h-12 w-1.5 rounded-full bg-[#F1F3EE] relative overflow-hidden">
                          <div 
                            className="absolute bottom-0 left-0 w-full rounded-full bg-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(186,191,28,0.3)]" 
                            style={{ height: `${requiredKavlings > 0 ? (kavlingSelected.length / requiredKavlings) * 100 : 0}%` }}
                          />
                          {/* Progress bar shimmer effect */}
                          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent -translate-y-full animate-shimmer" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1 space-y-6">
                        <div className="rounded-[2rem] bg-[#F1F3EE]/40 p-6 border border-[#E8E8E1]">
                          {kavlingAmbiguous ? (
                            <div className="space-y-6">
                              {combinedAll ? (
                                <p className="text-sm font-bold text-[#2D3E10] leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/20 underline-offset-4 decoration-2">{requiredKavlings} kavling</span> untuk paket yang Anda pilih.</p>
                              ) : combinedNonPrivate ? (
                                <p className="text-sm font-bold text-[#2D3E10] leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/20 underline-offset-4 decoration-2">{requiredKavlings} kavling</span> untuk Paket + Camping Mandiri.</p>
                              ) : (
                                <div className="flex flex-col gap-5">
                                  <div className="flex items-center gap-3">
                                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-bold text-[#2D3E10]/40 uppercase tracking-[0.3em]">Tentukan Kategori Kavling</span>
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    {kavlingQtyByGroup.mandiri > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("mandiri")}
                                        className={`group relative overflow-hidden rounded-xl px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 ${kavlingScopePick === "mandiri" ? "bg-[#2D3E10] text-white shadow-xl shadow-[#2D3E10]/20" : "bg-white border border-[#E8E8E1] text-[#2D3E10]/60 hover:border-primary/40 hover:text-primary"}`}
                                      >
                                        <span className="relative z-10">Camping Mandiri</span>
                                      </button>
                                    )}
                                    {kavlingQtyByGroup.paket > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("paket")}
                                        className={`group relative overflow-hidden rounded-xl px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 ${kavlingScopePick === "paket" ? "bg-[#2D3E10] text-white shadow-xl shadow-[#2D3E10]/20" : "bg-white border border-[#E8E8E1] text-[#2D3E10]/60 hover:border-primary/40 hover:text-primary"}`}
                                      >
                                        <span className="relative z-10">Paket</span>
                                      </button>
                                    )}
                                    {kavlingQtyByGroup.private > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("private")}
                                        className={`group relative overflow-hidden rounded-xl px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all duration-500 ${kavlingScopePick === "private" ? "bg-[#2D3E10] text-white shadow-xl shadow-[#2D3E10]/20" : "bg-white border border-[#E8E8E1] text-[#2D3E10]/60 hover:border-primary/40 hover:text-primary"}`}
                                      >
                                        <span className="relative z-10">Paket Private</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-[#2D3E10] leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/20 underline-offset-4 decoration-2">{requiredKavlings} kavling</span> untuk {effectiveKavlingScope}.</p>
                          )}
                        </div>
                        {hold?.expiresAt && holdLeftLabel && (
                          <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                            <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-[#F1F3EE]/50 p-6 shadow-xl shadow-primary/5 backdrop-blur-sm group/timer">
                              {/* Organic decorative background element */}
                              <div className="absolute -right-8 -top-8 h-32 w-32 opacity-[0.03] transition-transform duration-1000 group-hover/timer:scale-125 group-hover/timer:rotate-12">
                                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                  <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                                </svg>
                              </div>
                              
                              <div className="flex items-center gap-5 relative z-10">
                                <div className="relative">
                                  <div className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" />
                                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-sm border border-primary/10">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1 w-1 rounded-full bg-primary" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">Waktu Hold Kavling</span>
                                  </div>
                                  <div className="text-sm font-bold tracking-tight text-[#2D3E10]">
                                    Sesi pemilihan berakhir dalam <span className="text-primary italic underline decoration-primary/20 underline-offset-4 decoration-2">{holdLeftLabel}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setKavlingMapAssetVersion(Date.now());
                          setKavlingMapZoom(1);
                          setKavlingMapOpen(true);
                        }}
                        className="group relative flex h-16 shrink-0 items-center justify-center rounded-2xl border border-[#E8E8E1] bg-white px-8 text-[11px] font-black uppercase tracking-[0.2em] text-[#2D3E10] shadow-sm transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-95 lg:w-auto overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <svg className="relative z-10 mr-3 h-5 w-5 text-primary transition-transform duration-500 group-hover:scale-125 group-hover:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                        <span className="relative z-10">Buka Peta Interaktif</span>
                      </button>
                    </div>

                    <div className="flex flex-col gap-12 lg:flex-row">
                      {/* Map Preview */}
                      <div className="shrink-0 lg:w-1/3">
                        <button
                          type="button"
                          onClick={() => {
                            setKavlingMapAssetVersion(Date.now());
                            setKavlingMapZoom(1);
                            setKavlingMapOpen(true);
                          }}
                          className="group relative block aspect-[4/3] w-full overflow-hidden rounded-[2.5rem] border border-[#E8E8E1] bg-[#F1F3EE] transition-all duration-700 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5"
                        >
                          <img
                            src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            alt="Site Map Kavling"
                            className="h-full w-full object-contain cursor-zoom-in transition-all duration-1000 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 backdrop-blur-0 transition-all duration-700 group-hover:bg-[#2D3E10]/10 group-hover:backdrop-blur-[2px]">
                            <div className="flex translate-y-6 flex-col items-center gap-3 opacity-0 transition-all duration-700 group-hover:translate-y-0 group-hover:opacity-100">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#2D3E10] shadow-2xl">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white drop-shadow-lg">Zoom Peta</span>
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Kavling Grid */}
                      <div className="flex-1">
                        <div className="grid grid-cols-5 gap-3 sm:grid-cols-8 md:grid-cols-10">
                          {kavlingAll.map((n, idx) => {
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
                                className={`group/kavling relative flex h-12 items-center justify-center rounded-[1rem] border-2 text-[11px] font-black transition-all duration-500 overflow-hidden ${
                                  isSelected
                                    ? "border-primary bg-[#2D3E10] text-white shadow-xl shadow-primary/20 scale-105 z-10"
                                    : isTaken
                                    ? "border-[#F1F3EE] bg-[#F1F3EE]/30 text-[#2D3E10]/10 cursor-not-allowed"
                                    : disabled
                                    ? "border-[#F1F3EE] bg-[#F1F3EE]/20 text-[#2D3E10]/10 cursor-not-allowed opacity-40"
                                    : "border-[#E8E8E1] bg-white text-[#2D3E10] hover:border-primary/50 hover:bg-[#F1F3EE] hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                                }`}
                              >
                                {isSelected && (
                                  <div className="absolute inset-0 opacity-10 pointer-events-none">
                                    <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                      <path fill="currentColor" d="M0,0 L100,0 L100,100 L0,100 Z" />
                                    </svg>
                                  </div>
                                )}
                                <span className="relative z-10">{n}</span>
                                {!disabled && !isTaken && !isSelected && (
                                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary opacity-0 transition-all duration-300 group-hover/kavling:opacity-100 group-hover/kavling:bottom-1" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-12 flex flex-wrap gap-8 border-t border-[#E8E8E1]/60 pt-8">
                          <div className="flex items-center gap-3 group/legend">
                            <div className="relative h-4 w-4">
                              <div className="absolute inset-0 bg-[#2D3E10] rounded-full shadow-lg shadow-primary/20 transition-transform group-hover/legend:scale-125" />
                              <div className="absolute inset-0 bg-white/20 rounded-full scale-0 transition-transform duration-500 group-hover/legend:scale-75" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/60 transition-colors group-hover/legend:text-primary">Terpilih</span>
                          </div>
                          <div className="flex items-center gap-3 group/legend">
                            <div className="h-4 w-4 rounded-full border-2 border-[#E8E8E1] bg-white transition-all duration-300 group-hover/legend:border-primary/40 group-hover/legend:scale-110" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/60 transition-colors group-hover/legend:text-primary">Tersedia</span>
                          </div>
                          <div className="flex items-center gap-3 group/legend">
                            <div className="h-4 w-4 rounded-full bg-[#F1F3EE] opacity-50 grayscale transition-all duration-300 group-hover/legend:opacity-100 group-hover/legend:grayscale-0" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Sudah Terisi</span>
                          </div>
                          <div className="flex items-center gap-3 group/legend">
                            <div className="h-4 w-4 rounded-full border border-[#E8E8E1] bg-[#F1F3EE]/50 opacity-40 transition-all duration-300 group-hover/legend:opacity-100" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Tidak Sesuai</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {holdError ? (
                      <div className="mt-10 animate-in slide-in-from-top-4 duration-700">
                        <div className="flex items-center gap-5 rounded-[1.5rem] border border-red-200 bg-red-50/50 p-6 text-sm font-bold text-red-700 backdrop-blur-sm">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div className="space-y-1">
                            <p className="uppercase tracking-[0.15em] text-[10px] font-black">Kesalahan Pemilihan</p>
                            <p className="text-xs font-medium opacity-80">{holdError}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                {kavlingMapOpen ? (
                  <Modal
                    open={kavlingMapOpen}
                    title="Site Map Kavling"
                    onClose={() => setKavlingMapOpen(false)}
                    maxWidthClassName="max-w-6xl"
                  >
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              kavlingMapManualZoomRef.current = true;
                              setKavlingMapZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))));
                            }}
                            disabled={kavlingMapZoom <= 1}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E8E1] bg-white text-lg font-bold text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 disabled:opacity-30 disabled:hover:bg-white active:scale-95"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              kavlingMapManualZoomRef.current = false;
                              setKavlingMapOrigin({ x: 50, y: 50 });
                              setKavlingMapZoom(1);
                            }}
                            className="flex h-11 items-center justify-center rounded-xl border border-[#E8E8E1] bg-white px-5 text-[11px] font-bold uppercase tracking-widest text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-95"
                          >
                            100%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              kavlingMapManualZoomRef.current = true;
                              setKavlingMapZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E8E8E1] bg-white text-lg font-bold text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-95"
                          >
                            +
                          </button>
                          <div className="h-6 w-px bg-[#E8E8E1] mx-1 hidden sm:block" />
                          <a
                            href={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-11 items-center justify-center rounded-xl border border-[#E8E8E1] bg-white px-6 text-[11px] font-bold uppercase tracking-widest text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-95"
                          >
                            Buka Tab Baru
                          </a>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/40">
                            Arahkan kursor untuk zoom otomatis
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
                            <div className="text-[11px] font-bold text-[#2D3E10]">
                              Zoom: <span className="font-serif italic opacity-60">{Math.round(kavlingMapZoom * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`max-h-[70dvh] overflow-auto rounded-[2rem] border-4 border-[#F1F3EE] bg-[#F1F3EE]/30 shadow-inner ${kavlingMapDragging ? "cursor-grabbing" : "cursor-grab"}`}
                        ref={kavlingMapViewportRef}
                        onMouseEnter={() => {
                          setKavlingMapHover(true);
                          if (!kavlingMapManualZoomRef.current && kavlingMapZoom === 1) setKavlingMapZoom(2);
                        }}
                        onMouseLeave={() => {
                          setKavlingMapHover(false);
                          if (kavlingMapMoveRafRef.current) {
                            cancelAnimationFrame(kavlingMapMoveRafRef.current);
                            kavlingMapMoveRafRef.current = null;
                          }
                          kavlingMapMovePosRef.current = null;
                          if (!kavlingMapManualZoomRef.current) {
                            setKavlingMapOrigin({ x: 50, y: 50 });
                            setKavlingMapZoom(1);
                          }
                        }}
                        onMouseMove={(e) => {
                          if (kavlingMapDragRef.current) return;
                          if (!kavlingMapHover) return;
                          if (kavlingMapPinchRef.current) return;
                          const img = kavlingMapImgRef.current;
                          if (!img) return;
                          kavlingMapMovePosRef.current = { x: e.clientX, y: e.clientY };
                          if (kavlingMapMoveRafRef.current) return;
                          kavlingMapMoveRafRef.current = requestAnimationFrame(() => {
                            kavlingMapMoveRafRef.current = null;
                            const pos = kavlingMapMovePosRef.current;
                            if (!pos) return;
                            const r = img.getBoundingClientRect();
                            const x = ((pos.x - r.left) / Math.max(1, r.width)) * 100;
                            const y = ((pos.y - r.top) / Math.max(1, r.height)) * 100;
                            setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                          });
                        }}
                        onWheel={(e) => {
                          if (!e.ctrlKey) return;
                          e.preventDefault();
                          kavlingMapManualZoomRef.current = true;
                          const img = kavlingMapImgRef.current;
                          if (!img) return;
                          const r = img.getBoundingClientRect();
                          const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
                          const y = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
                          setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                          setKavlingMapZoom((z) => {
                            const next = z * Math.exp(-e.deltaY * 0.0012);
                            return Math.max(1, Math.min(4, Number(next.toFixed(3))));
                          });
                        }}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse" && e.button !== 0) return;
                          if (kavlingMapPinchRef.current) return;
                          const el = kavlingMapViewportRef.current;
                          if (!el) return;
                          if (e.pointerType === "touch" && !kavlingMapManualZoomRef.current && kavlingMapZoom === 1) {
                            const img = kavlingMapImgRef.current;
                            if (img) {
                              const r = img.getBoundingClientRect();
                              const x = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
                              const y = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
                              setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                            }
                            setKavlingMapZoom(2);
                          }
                          kavlingMapDragRef.current = {
                            pointerId: e.pointerId,
                            startX: e.clientX,
                            startY: e.clientY,
                            left: el.scrollLeft,
                            top: el.scrollTop,
                          };
                          setKavlingMapDragging(true);
                          el.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const el = kavlingMapViewportRef.current;
                          const st = kavlingMapDragRef.current;
                          if (!el || !st) return;
                          if (st.pointerId !== e.pointerId) return;
                          e.preventDefault();
                          const dx = e.clientX - st.startX;
                          const dy = e.clientY - st.startY;
                          el.scrollLeft = st.left - dx;
                          el.scrollTop = st.top - dy;
                          if (e.pointerType === "touch" && kavlingMapZoom > 1) {
                            const img = kavlingMapImgRef.current;
                            if (!img) return;
                            kavlingMapMovePosRef.current = { x: e.clientX, y: e.clientY };
                            if (kavlingMapMoveRafRef.current) return;
                            kavlingMapMoveRafRef.current = requestAnimationFrame(() => {
                              kavlingMapMoveRafRef.current = null;
                              const pos = kavlingMapMovePosRef.current;
                              if (!pos) return;
                              const r = img.getBoundingClientRect();
                              const x = ((pos.x - r.left) / Math.max(1, r.width)) * 100;
                              const y = ((pos.y - r.top) / Math.max(1, r.height)) * 100;
                              setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                            });
                          }
                        }}
                        onPointerUp={(e) => {
                          const el = kavlingMapViewportRef.current;
                          const st = kavlingMapDragRef.current;
                          if (!el || !st) return;
                          if (st.pointerId !== e.pointerId) return;
                          kavlingMapDragRef.current = null;
                          setKavlingMapDragging(false);
                          el.releasePointerCapture(e.pointerId);
                        }}
                        onPointerCancel={() => {
                          kavlingMapDragRef.current = null;
                          setKavlingMapDragging(false);
                        }}
                        onTouchStart={() => setKavlingMapHover(true)}
                        onTouchEnd={() => setKavlingMapHover(false)}
                        onTouchStartCapture={(e) => {
                          if (e.touches.length !== 2) return;
                          kavlingMapDragRef.current = null;
                          setKavlingMapDragging(false);
                          const a = e.touches.item(0);
                          const b = e.touches.item(1);
                          if (!a || !b) return;
                          const dx = a.clientX - b.clientX;
                          const dy = a.clientY - b.clientY;
                          const dist = Math.hypot(dx, dy);
                          kavlingMapManualZoomRef.current = true;
                          kavlingMapPinchRef.current = { startDist: dist, startZoom: kavlingMapZoom };
                        }}
                        onTouchMoveCapture={(e) => {
                          if (e.touches.length !== 2) return;
                          const img = kavlingMapImgRef.current;
                          const pinch = kavlingMapPinchRef.current;
                          if (!img || !pinch) return;
                          const a = e.touches.item(0);
                          const b = e.touches.item(1);
                          if (!a || !b) return;
                          const dx = a.clientX - b.clientX;
                          const dy = a.clientY - b.clientY;
                          const dist = Math.hypot(dx, dy);
                          const scale = dist / Math.max(1, pinch.startDist);
                          const nextZoom = Math.max(1, Math.min(4, pinch.startZoom * scale));

                          const midX = (a.clientX + b.clientX) / 2;
                          const midY = (a.clientY + b.clientY) / 2;
                          const r = img.getBoundingClientRect();
                          const x = ((midX - r.left) / Math.max(1, r.width)) * 100;
                          const y = ((midY - r.top) / Math.max(1, r.height)) * 100;
                          setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                          setKavlingMapZoom(Number(nextZoom.toFixed(3)));
                        }}
                        onTouchEndCapture={(e) => {
                          if (e.touches.length >= 2) return;
                          kavlingMapPinchRef.current = null;
                        }}
                        style={{ touchAction: "none" }}
                      >
                        <div className="flex min-h-[360px] min-w-0 items-center justify-center p-2 sm:min-w-[680px] sm:p-4">
                          <img
                            src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            alt="Site Map Kavling"
                            className="h-auto max-w-full select-none sm:max-w-none"
                            ref={kavlingMapImgRef}
                            draggable={false}
                            decoding="async"
                            style={{
                              transform: `translateZ(0) scale(${kavlingMapZoom})`,
                              transformOrigin: `${kavlingMapOrigin.x}% ${kavlingMapOrigin.y}%`,
                              transition: "transform 120ms ease",
                              willChange: "transform",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Modal>
                ) : null}
                  </div>
                </div>
              )}

              {/* Add-Ons Section */}
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="flex items-center text-2xl font-black text-foreground">
                      <svg className="mr-3 h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Fasilitas Tambahan
                    </h3>
                    <p className="text-sm font-medium text-primary/60">Lengkapi kenyamanan menginap Anda dengan add-ons pilihan.</p>
                  </div>
                  <div className="hidden sm:block">
                    <span className="rounded-full bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-primary">Opsional</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {addons.map((a, idx) => {
                    const isSelected = (effectiveAddonQty[a.id] ?? 0) > (autoAddonQty[a.id] ?? 0);
                    const auto = autoAddonQty[a.id] ?? 0;
                    return (
                      <div 
                        key={a.id} 
                        className={`group relative overflow-hidden rounded-[2.5rem] border p-7 transition-all duration-700 ${
                          isSelected 
                            ? "border-primary/20 bg-[#F1F3EE] shadow-xl shadow-primary/5 scale-[1.02]" 
                            : "border-[#E8E8E1] bg-white hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                        }`}
                      >
                        {/* Organic decorative element for selected */}
                        {isSelected && (
                          <div className="absolute -right-6 -top-6 h-24 w-24 opacity-10">
                            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                              <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                            </svg>
                          </div>
                        )}

                        <div className="flex flex-col h-full justify-between gap-8">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="text-[17px] font-black tracking-tight text-[#2D3E10] leading-tight group-hover:text-primary transition-colors">
                                {a.name}
                              </h4>
                              {auto > 0 && (
                                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-primary">
                                  Included
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xl font-black text-primary tracking-tight">{formatIDR(a.price)}</span>
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/30">/ unit</span>
                            </div>
                            {auto > 0 && (
                              <div className="flex items-center gap-2 rounded-xl bg-primary/5 p-3">
                                <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-[10px] font-bold text-primary/70 leading-relaxed uppercase tracking-widest">
                                  {auto} unit termasuk dalam paket
                                </p>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between pt-6 border-t border-[#E8E8E1]">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/40">Atur Jumlah</span>
                            </div>
                            <div className="scale-110 origin-right">
                              <QuantityStepper
                                value={effectiveAddonQty[a.id] ?? 0}
                                min={autoAddonQty[a.id] ?? 0}
                                ariaLabel={`qty ${a.name}`}
                                onChange={(next) => {
                                  const auto = autoAddonQty[a.id] ?? 0;
                                  const manual = Math.max(0, next - auto);
                                  setAddonQty((s) => ({ ...s, [a.id]: manual }));
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {addons.length === 0 && (
                  <div className="rounded-[2.5rem] border-2 border-dashed border-[#E8E8E1] bg-[#F1F3EE]/20 p-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary/40 shadow-sm border border-[#E8E8E1]">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </div>
                    <h4 className="mt-6 text-lg font-black text-[#2D3E10]">Tidak Ada Add-On</h4>
                    <p className="mt-2 text-[10px] font-bold text-[#2D3E10]/30 uppercase tracking-[0.2em]">Belum ada fasilitas tambahan yang tersedia saat ini.</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="relative overflow-hidden rounded-[2.5rem] border border-red-100 bg-red-50/30 p-7 shadow-xl shadow-red-900/5 backdrop-blur-sm">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-red-100/20 blur-3xl" />
                    <div className="flex items-center gap-6 relative z-10">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-red-500 shadow-sm border border-red-50">
                        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/50">Terjadi Kesalahan</span>
                        <span className="text-sm font-bold text-red-600 leading-relaxed">{error}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {guestOverCapacity && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="relative overflow-hidden rounded-[2.5rem] border border-amber-100 bg-amber-50/30 p-7 shadow-xl shadow-amber-900/5 backdrop-blur-sm">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-100/20 blur-3xl" />
                    <div className="flex items-center gap-6 relative z-10">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm border border-amber-50">
                        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500/50">Kapasitas Terlampaui</span>
                        <span className="text-sm font-bold text-amber-600 leading-relaxed">Total tamu melebihi kapasitas paket yang dipilih. Mohon sesuaikan jumlah tamu atau pilih unit tambahan.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

                  <div className="flex flex-col gap-5 pt-12 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="group order-2 flex h-16 flex-1 items-center justify-center rounded-[1.2rem] border border-[#E8E8E1] bg-white px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-[0.98] sm:order-1"
                    >
                      <svg className="mr-3 h-4 w-4 text-primary transition-transform duration-500 group-hover:-translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || loading || guestOverCapacity || selectedVisibleCount === 0}
                      className="group relative order-1 flex h-16 flex-[2] items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#2D3E10] px-10 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] hover:-translate-y-1 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none sm:order-2"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                      
                      {submitting || loading ? (
                        <div className="flex items-center gap-3">
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="tracking-widest">Memproses...</span>
                        </div>
                      ) : (
                        <div className="relative z-10 flex items-center gap-3">
                          <span>Konfirmasi Booking</span>
                          <svg className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>
                  </div>
                </div>
              </form>
          ) : null}
        </div>

        {/* Sidebar Summary - Sticky on Desktop */}
        <div className="hidden lg:block">
          {sidebarContent}
        </div>
      </div>
    </div>
    
    {/* Nature-Inspired Footer */}
    <footer className="mt-20 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center">
          <div className="w-full max-w-2xl rounded-[2rem] bg-[#F1F3EE] p-8 space-y-6 text-center">
            <h4 className="text-sm font-bold text-[#2D3E10]">Butuh bantuan reservasi?</h4>
            <p className="text-xs text-[#2D3E10]/60 leading-relaxed">Tim reservasi kami siap membantu Anda merencanakan liburan impian yang tak terlupakan.</p>
            <a href="https://wa.me/6281234567890" target="_blank" className="mx-auto flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-[#2D3E10] text-[11px] font-bold uppercase tracking-widest text-white shadow-lg shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] hover:shadow-xl active:scale-95">
              Hubungi via WhatsApp
            </a>
          </div>
        </div>

        <div className="mt-16 flex flex-col md:flex-row justify-center items-center gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#2D3E10]/30">
            &copy; 2026 Woodforest Jayagiri 48. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  </div>
)}
</div>
</div>
);
}
