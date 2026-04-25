"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  const btnClass = size === "sm" ? "h-10 w-10 text-base" : "h-12 w-12 text-xl";
  const midClass = size === "sm" ? "min-w-[40px] px-2 text-sm" : "min-w-[48px] px-3 text-base";

  return (
    <div className="inline-flex w-fit items-center overflow-hidden rounded-2xl border-2 border-border bg-surface shadow-sm transition-all hover:border-primary/30">
      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnClass} flex items-center justify-center font-black text-foreground transition-all hover:bg-muted active:scale-90 disabled:opacity-20 disabled:hover:bg-transparent`}
        aria-label={`Kurangi ${ariaLabel}`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
      <div className={`${midClass} flex items-center justify-center border-x-2 border-border text-center font-black text-primary`} aria-label={ariaLabel}>
        {value}
      </div>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        className={`${btnClass} flex items-center justify-center font-black text-foreground transition-all hover:bg-muted active:scale-90 disabled:opacity-20 disabled:hover:bg-transparent`}
        aria-label={`Tambah ${ariaLabel}`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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

  useEffect(() => {
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
    setKavlingSelected((prev) => prev.slice(0, requiredKavlings));
  }, [requiredKavlings]);

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
    if (!hold?.id || !hold?.token) {
      const dHold = draftHoldCredsFor({ checkIn, checkOut });
      if (dHold?.id && dHold?.token) {
        setHold(dHold);
        return;
      }
    }
    if (!requiredKavlings) {
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError(null);
      return;
    }
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
      hold: hold?.id && hold?.token ? { id: hold.id, token: hold.token, expiresAt: hold.expiresAt } : d.hold,
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
    <div className="sticky top-6 space-y-5">
      <div className="overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-2xl shadow-primary/5 backdrop-blur-xl">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <h3 className="text-xl font-black text-foreground">Ringkasan Pesanan</h3>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Stay Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted">
              <span>Jadwal & Tamu</span>
              <button onClick={() => setCurrentStep(2)} className="text-primary hover:underline">Ubah</button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">
                    {checkIn ? formatDateWIB(new Date(checkIn)) : "Pilih Tanggal"} - {checkOut ? formatDateWIB(new Date(checkOut)) : ""}
                  </span>
                  <span className="text-[10px] font-medium text-muted">Check-in & Check-out</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">{totalGuest} Orang</span>
                  <span className="text-[10px] font-medium text-muted">{adultPax} Dewasa, {childPax} Anak</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-border/60" />

          {/* Selected Units */}
          <div className="space-y-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted">Unit Terpilih</div>
            {selectedVisibleUnits.length > 0 ? (
              <div className="space-y-4">
                {selectedVisibleUnits.map(u => {
                  const qty = unitQty[u.id] || 0;
                  return (
                    <div key={u.id} className="flex justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground leading-tight">{u.name}</span>
                        <span className="text-xs text-muted">x{qty} Unit</span>
                      </div>
                      <span className="text-sm font-black text-foreground">{formatIDR(sumDailyPrice(u) * qty)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm font-medium text-muted/60 italic">Belum ada unit dipilih</p>
            )}
          </div>

          {/* Add-ons if any */}
          {Object.keys(addonQty).some(id => addonQty[id] > 0) && (
            <>
              <div className="h-px bg-border/60" />
              <div className="space-y-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted">Tambahan</div>
                <div className="space-y-3">
                  {addons.filter(a => addonQty[a.id] > 0).map(a => (
                    <div key={a.id} className="flex justify-between gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground leading-tight">{a.name}</span>
                        <span className="text-xs text-muted">x{addonQty[a.id]}</span>
                      </div>
                      <span className="text-sm font-black text-foreground">{formatIDR(a.price * addonQty[a.id])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="h-px bg-border/60" />

          {/* Total */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted">Total Estimasi</span>
              <span className="text-2xl font-black text-primary">{formatIDR(estimatedAmount)}</span>
            </div>
            <p className="text-[10px] font-medium text-muted leading-relaxed">
              * Harga sudah termasuk pajak dan belum termasuk biaya layanan.
            </p>
          </div>
        </div>

        <div className="bg-muted/30 px-8 py-6">
          <button
            onClick={() => {
              if (currentStep === 1) setCurrentStep(2);
              else if (currentStep === 2) setCurrentStep(3);
              else onSubmit(new Event('submit') as any);
            }}
            disabled={(currentStep === 1 && !filterCategory) || (currentStep === 2 && (!name || !phone || !email || !checkIn || !checkOut)) || (currentStep === 3 && selectedVisibleCount === 0)}
            className="w-full rounded-2xl bg-primary py-4 text-sm font-black text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:bg-primary/90 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:shadow-none"
          >
            {currentStep === 1 ? "Lanjut Isi Data" : currentStep === 2 ? "Lanjut Pilih Unit" : "Konfirmasi Booking"}
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border-2 border-dashed border-border p-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2">Butuh Bantuan?</p>
        <p className="text-xs font-bold text-foreground mb-4">Hubungi Admin Woodforest</p>
        <a href="https://wa.me/628112090808" target="_blank" className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500/10 px-6 text-[10px] font-black uppercase tracking-widest text-emerald-600 transition-all hover:bg-emerald-500 hover:text-white">
          WhatsApp Chat
        </a>
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
        <div className={`${success ? "no-print " : ""}mb-8 overflow-hidden rounded-[2.5rem] border border-border bg-surface/50 p-6 shadow-2xl shadow-primary/5 backdrop-blur-xl transition-all hover:shadow-primary/10`}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[180px_1fr] sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <div className="relative group">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <img src="/brand/logowf.png" alt="Woodforest" className="relative h-24 w-24 shrink-0 rounded-2xl object-contain sm:h-36 sm:w-36 transition-transform duration-700 group-hover:scale-105" />
              </div>
            </div>
            <div className="sm:-mt-2">
              <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">
                <span className="relative flex h-2 w-2 mr-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Luxury Camping Ground
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-foreground sm:text-5xl">
                Woodforest <span className="text-primary italic">Booking</span>
              </h1>
              <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-muted">
                Grounded, calm, warm. Pilih tanggal, pilih paket, dan kami siapkan pengalaman yang tenang di alam untuk bonding keluarga.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {["Quiet nature", "Family bonding", "Wellness", "Light adventure"].map((tag) => (
                  <div key={tag} className="rounded-2xl border-2 border-border bg-surface px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-muted transition-all hover:border-primary/40 hover:text-primary hover:-translate-y-1">
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
              <div className="print-page print-invoice overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                <div className="p-6 print-tight print-compact-text">
                  <div className="text-center">
                    <img src="/brand/logowf.png" alt="Woodforest" className="print-logo mx-auto h-40 w-40 object-contain" />
                    <div className="mt-0.5 text-base font-bold leading-tight text-foreground">Woodforest Jayagiri 48</div>
                    <div className="mt-0.5 text-[10px] tracking-[0.2em] text-muted">Quiet nature • Family bonding • Wellness • Light adventure</div>
                    <div className="mt-1 text-[11px] text-muted">admin@woodforestjayagiri48.com · +62 811-2090-808</div>
                    <div className="mt-0.5 text-[10px] text-muted">Jam check-in 14:00 WIB • Check-out 12:00 WIB • Tunjukkan Booking ID saat check-in</div>
                  </div>

                  <div className="my-2 h-px bg-border" />

                  {invoice ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-bold text-foreground">Invoice / Booking Confirmation</div>
                          <div className="mt-2 text-xs text-muted">Dear {invoice.customer.name},</div>
                          <div className="mt-1 text-xs text-muted">Terima kasih telah memilih Woodforest Jayagiri 48. Berikut detail booking Anda.</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted">Booking ID</div>
                          <div className="mt-0.5 font-mono text-sm font-bold text-foreground">{invoice.code}</div>
                          <div className="mt-2 text-xs text-muted">Status</div>
                          <div className="mt-0.5 text-sm font-bold text-foreground">
                            {invoice.payment.paidAmount >= invoice.payment.amount ? "Confirmed" : "Pending"}
                          </div>
                        </div>
                      </div>

                      <div className="my-2 h-px bg-border" />

                      <div className="print-grid grid grid-cols-1 gap-4 md:grid-cols-5">
                        <div className="print-box rounded-xl border border-border p-4 md:col-span-3">
                          <div className="text-sm font-bold text-foreground">Detail Booking</div>
                          <div className="mt-3 text-xs text-muted">Item</div>
                          <div className="mt-2 space-y-2">
                            {(invoice.items ?? []).map((it, idx) => (
                              <div key={`${it.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                <div className="text-foreground">{it.name}</div>
                                <div className="text-muted">x{it.quantity}</div>
                              </div>
                            ))}
                            {(invoice.items ?? []).length === 0 ? <div className="text-sm text-muted">-</div> : null}
                          </div>

                          {invoice.addOns?.length ? (
                            <>
                              <div className="my-4 h-px bg-border/60" />
                              <div className="text-xs text-muted">Add-Ons</div>
                              <div className="mt-2 space-y-2">
                                {invoice.addOns.map((a, idx) => (
                                  <div key={`${a.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                    <div className="text-foreground">
                                      {a.name} <span className="text-xs text-muted">({formatIDR(a.price)})</span>
                                    </div>
                                    <div className="text-muted">x{a.quantity}</div>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : null}

                          <div className="my-4 h-px bg-border/60" />

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="text-muted">Nama</div>
                            <div className="text-right font-semibold text-foreground">{invoice.customer.name}</div>
                            <div className="text-muted">Kontak</div>
                            <div className="text-right text-foreground">
                              {invoice.customer.phone} · {invoice.customer.email}
                            </div>
                            <div className="text-muted">Check-in</div>
                            <div className="text-right font-semibold text-foreground">{formatDateWIB(new Date(invoice.checkIn))}</div>
                            <div className="text-muted">Check-out</div>
                            <div className="text-right font-semibold text-foreground">{formatDateWIB(new Date(invoice.checkOut))}</div>
                            <div className="text-muted">Guest</div>
                            <div className="text-right text-foreground">{invoice.totalGuest}</div>
                            <div className="text-muted">Kavling</div>
                            <div className="text-right text-foreground">
                              {invoice.kavlings?.length ? invoice.kavlings.slice().sort((a, b) => a - b).join(", ") : "-"}
                            </div>
                          </div>

                          {invoice.specialRequest ? (
                            <>
                              <div className="my-4 h-px bg-border/60" />
                              <div className="text-xs font-bold text-foreground">Special Request</div>
                              <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{invoice.specialRequest}</div>
                            </>
                          ) : null}

                          <div className="my-4 h-px bg-border/60" />
                          <div className="print-hide">
                            <div className="text-xs font-bold text-foreground">Cancellation Policy</div>
                            <div className="mt-2 text-xs text-muted">
                              Pembatalan dapat dikenakan biaya sesuai kebijakan. Silakan hubungi admin untuk detail kebijakan pembatalan.
                            </div>
                          </div>
                        </div>

                        <div className="print-box rounded-xl border border-border p-4 md:col-span-2">
                          <div className="text-sm font-bold text-foreground">Ringkasan Pembayaran</div>

                          {(() => {
                            const addOnAmount = invoice.addOns.reduce((acc, a) => acc + a.quantity * a.price, 0);
                            const baseAmount = Math.max(0, invoice.payment.amount - addOnAmount);
                            const paidAtText = invoice.payment.paidAt ? `${formatDateWIB(new Date(invoice.payment.paidAt))} WIB` : "-";
                            return (
                              <div className="mt-3 space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted">Room / Paket</div>
                                  <div className="text-foreground">{formatIDR(baseAmount)}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted">Add-Ons</div>
                                  <div className="text-foreground">{formatIDR(addOnAmount)}</div>
                                </div>
                                <div className="my-3 h-px bg-border/60" />
                                <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                  <div className="text-foreground">Total</div>
                                  <div className="text-foreground">{formatIDR(invoice.payment.amount)}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted">Amount Paid</div>
                                  <div className="text-foreground">{formatIDR(invoice.payment.paidAmount)}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted">Paid at</div>
                                  <div className="text-foreground">{paidAtText}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted">Metode</div>
                                  <div className="text-foreground">{invoice.payment.method ?? "-"}</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="print-hide print-box mt-6 rounded-xl border border-border bg-surface p-4 text-xs text-muted">
                        Simpan halaman ini sebagai bukti booking. Tunjukkan Booking ID saat check-in.
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">Menyiapkan invoice...</div>
                  )}
                </div>
              </div>

              <div className="no-print mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  disabled={!invoice}
                >
                  Unduh E-Voucher / Cetak
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem("wf_booking_draft");
                    window.location.href = window.location.pathname;
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground hover:bg-background"
                >
                  Booking Lagi
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 space-y-8 pb-20">
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
                          <div className="absolute left-[calc(50%+20px)] right-[-calc(50%-20px)] top-5 h-[2px] bg-border/40">
                            <div 
                              className="h-full bg-primary transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1)" 
                              style={{ width: isCompleted ? "100%" : "0%" }}
                            />
                          </div>
                        )}

                        <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition-all duration-500 ${
                          isActive 
                            ? "border-primary bg-primary text-white shadow-xl shadow-primary/20 scale-105" 
                            : isCompleted 
                              ? "border-primary bg-primary/10 text-primary" 
                              : "border-border bg-surface text-muted/30"
                        }`}>
                          {isCompleted ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <span className="text-sm font-black tracking-tight">{step}</span>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-center text-center">
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${
                            isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted/40"
                          }`}>
                            Langkah {step}
                          </span>
                          <span className={`text-xs font-bold transition-colors duration-300 ${
                            isActive ? "text-foreground" : isCompleted ? "text-muted" : "text-muted/30"
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
                      <div className="mb-10 text-center">
                        <div className="inline-flex items-center rounded-full bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 border border-primary/10 backdrop-blur-sm">
                          Langkah Pertama
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl mb-4">
                          Pilih <span className="text-primary italic font-serif">Pengalaman</span> Anda
                        </h2>
                        <p className="mx-auto max-w-2xl text-base font-medium text-muted/80 leading-relaxed">
                          Temukan harmoni sempurna antara kemewahan modern dan keasrian alam Jayagiri. 
                          Pilih kategori yang paling sesuai dengan rencana liburan Anda.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                                  setFilterCategory(cat);
                                  setCurrentStep(2);
                                }}
                                className={`flex flex-col h-full overflow-hidden rounded-[2.5rem] border-2 transition-all duration-700 hover:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] hover:-translate-y-2 ${
                                  filterCategory === cat 
                                    ? "border-primary bg-primary/[0.02] shadow-2xl shadow-primary/5" 
                                    : "border-border/60 bg-surface hover:border-primary/40"
                                }`}
                              >
                                <div className="relative h-48 w-full overflow-hidden">
                                  {packageConfigs[cat]?.imageUrl ? (
                                    <img 
                                      src={packageConfigs[cat].imageUrl} 
                                      alt={cat} 
                                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                                    />
                                  ) : (
                                    <div className={`absolute inset-0 bg-gradient-to-br transition-transform duration-1000 group-hover:scale-110 ${
                                      isGlamping ? "from-emerald-100 to-teal-50" : 
                                      isPrivate ? "from-amber-100 to-orange-50" : 
                                      "from-blue-100 to-indigo-50"
                                    }`} />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center opacity-20 mix-blend-overlay">
                                    <svg className="w-40 h-40" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                      <path fill="currentColor" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8C87.4,-32.5,90,-16.3,88.5,-0.9C87,14.5,81.4,29,72.6,41.4C63.8,53.8,51.8,64,38.3,71.2C24.8,78.4,9.8,82.6,-5.3,81.8C-20.4,81,-35.5,75.2,-48.6,66.3C-61.7,57.4,-72.8,45.4,-78.9,31.5C-85,17.6,-86.1,1.8,-83.4,-13.4C-80.7,-28.6,-74.2,-43.1,-63.4,-53.4C-52.6,-63.7,-37.5,-69.8,-23.4,-77C-9.3,-84.2,3.8,-92.5,44.7,-76.4Z" transform="translate(100 100)" />
                                    </svg>
                                  </div>
                                  
                                  <div className={`absolute top-5 left-5 flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-700 ${
                                    filterCategory === cat ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-white/80 backdrop-blur-md text-primary group-hover:bg-primary group-hover:text-white group-hover:rotate-12"
                                  }`}>
                                    {isGlamping ? (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.5 21 12 3l8.5 18M12 3v18M9 21l3-5 3 5" />
                                      </svg>
                                    ) : isPrivate ? (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.5 21 12 3l8.5 18M12 3v18M9 21l3-5 3 5" />
                                      </svg>
                                    ) : (
                                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.5 21 12 3l8.5 18M12 3v18M9 21l3-5 3 5" />
                                      </svg>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col flex-1 p-6 text-left">
                                  <h3 className="text-xl font-black text-foreground mb-3 group-hover:text-primary transition-colors">{cat}</h3>
                                  <p className="text-sm font-medium leading-relaxed text-muted/70 mb-6 flex-1">
                                    {packageConfigs[cat]?.description || (
                                      cat === "Glamping" ? "Nikmati kemewahan berkemah dengan fasilitas lengkap di tengah rimbunnya hutan Jayagiri yang menenangkan." : 
                                      cat === "Paket" ? "Pilihan paket lengkap yang dirancang khusus untuk menciptakan momen berharga bersama keluarga tercinta." :
                                      "Pengalaman eksklusif dengan privasi tinggi untuk momen spesial Anda bersama orang terdekat di alam terbuka."
                                    )}
                                  </p>

                                  <div className="flex items-center justify-between pt-5 border-t border-border/40">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Lihat Detail</span>
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-white group-hover:translate-x-1">
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
                <div className="mb-8 text-center">
                  <div className="inline-flex items-center rounded-full bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 border border-primary/10">
                    Step 02
                  </div>
                  <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl">
                    Detail <span className="text-primary italic">Tamu</span>
                  </h2>
                  <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-muted">
                    Informasi jumlah tamu membantu kami menyiapkan fasilitas yang tepat untuk kenyamanan keluarga Anda.
                  </p>
                </div>

                <div className="mx-auto w-full">
                  <form onSubmit={(e) => { e.preventDefault(); setCurrentStep(3); }} className="space-y-8">
                    <div className="space-y-8">
                      {/* Section: Stay Details */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-black text-foreground">Detail Menginap</h3>
                        </div>

                        <div className="overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-sm transition-all hover:shadow-md p-6">
                          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                            <div className="space-y-3">
                              <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Check-in</label>
                              <div className="relative group">
                                <input
                                  type="date"
                                  value={checkIn}
                                  onChange={(e) => setCheckIn(e.target.value)}
                                  className="w-full rounded-2xl border border-border bg-surface pl-12 pr-4 py-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 group-hover:border-primary/40"
                                  required
                                />
                                <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Check-out</label>
                              <div className="relative group">
                                <input
                                  type="date"
                                  value={checkOut}
                                  onChange={(e) => setCheckOut(e.target.value)}
                                  className="w-full rounded-2xl border border-border bg-surface pl-12 pr-4 py-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 group-hover:border-primary/40"
                                  required
                                />
                                <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 space-y-3 pt-6 border-t border-border/60">
                            <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Jumlah Tamu</label>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 p-4 transition-all hover:bg-muted/30">
                                <div className="space-y-0.5">
                                  <p className="text-sm font-black text-foreground">Dewasa</p>
                                  <p className="text-[10px] font-bold text-muted">Usia 12+</p>
                                </div>
                                <QuantityStepper 
                                  value={adultPax} 
                                  min={1} 
                                  ariaLabel="Dewasa" 
                                  onChange={setAdultPax} 
                                />
                              </div>
                              <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 p-4 transition-all hover:bg-muted/30">
                                <div className="space-y-0.5">
                                  <p className="text-sm font-black text-foreground">Anak</p>
                                  <p className="text-[10px] font-bold text-muted">Usia &lt; 12</p>
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
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-black text-foreground">Informasi Kontak</h3>
                        </div>

                        <div className="overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-sm transition-all hover:shadow-md p-6 space-y-5">
                          <div className="space-y-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Nama Lengkap</label>
                            <div className="relative group">
                              <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-2xl border border-border bg-surface pl-12 pr-4 py-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 group-hover:border-primary/40"
                                placeholder="Sesuai KTP"
                                required
                              />
                              <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div className="space-y-3">
                              <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">WhatsApp</label>
                              <div className="relative group">
                                <input
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  className="w-full rounded-2xl border border-border bg-surface pl-14 pr-4 py-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 group-hover:border-primary/40"
                                  placeholder="0812..."
                                  required
                                />
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-primary">+62</span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Email</label>
                              <div className="relative group">
                                <input
                                  type="email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  className="w-full rounded-2xl border border-border bg-surface pl-12 pr-4 py-3.5 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 group-hover:border-primary/40"
                                  placeholder="email@anda.com"
                                  required
                                />
                                <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 pt-3">
                            <label className="text-xs font-black uppercase tracking-widest text-muted ml-1">Permintaan Khusus</label>
                            <textarea
                              value={specialRequest}
                              onChange={(e) => setSpecialRequest(e.target.value)}
                              className="h-28 w-full rounded-2xl border border-border bg-surface px-5 py-4 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none group-hover:border-primary/40"
                              placeholder="Opsional: Request lokasi, check-in awal, dll."
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="order-2 flex-1 rounded-2xl border-2 border-border bg-surface px-6 py-4 text-sm font-black text-foreground transition-all hover:bg-muted active:scale-95 sm:order-1"
                      >
                        Kembali
                      </button>
                      <button
                        type="submit"
                        disabled={!name || !phone || !email || !checkIn || !checkOut}
                        className="order-1 flex-1 rounded-2xl bg-primary px-6 py-4 text-sm font-black text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:bg-primary/90 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:shadow-none sm:order-2"
                      >
                        Lanjut Pilih Unit
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
                  <div className="mb-8 text-center">
                    <div className="inline-flex items-center rounded-full bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 border border-primary/10">
                      Step 03
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl">
                      Pilihan <span className="text-primary italic">Unit & Kavling</span>
                    </h2>
                    <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-muted">
                      Tentukan unit dan lokasi kavling favorit Anda untuk pengalaman menginap yang tak terlupakan.
                    </p>
                  </div>

                  <div className="mx-auto w-full space-y-8">
                    <div className="mb-8 flex flex-col items-center justify-between gap-5 rounded-[2.5rem] border border-border bg-surface/50 p-5 backdrop-blur-xl shadow-sm sm:flex-row sm:p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Kategori</p>
                          <p className="text-sm font-black text-foreground">{filterCategory || "Semua Paket"}</p>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-border hidden sm:block" />

                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted">Jadwal</p>
                          <p className="text-sm font-black text-foreground">{checkIn} - {checkOut}</p>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-border hidden sm:block" />

                      <div className="relative group w-full sm:w-auto">
                        <select
                          value={filterType}
                          onChange={(e) => setFilterType(e.target.value)}
                          className="h-12 w-full appearance-none rounded-2xl border border-border bg-surface pl-5 pr-12 text-xs font-black text-foreground outline-none transition-all group-hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10 sm:w-44"
                        >
                          <option value="">Semua Tipe</option>
                          {typeOptions.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
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
                        className={`group flex flex-col overflow-hidden rounded-[2.5rem] border border-border bg-surface transition-all duration-500 ${
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
                              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                                <span className="rounded-full bg-destructive/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-destructive">Penuh</span>
                              </div>
                            )}
                            <div className="absolute left-6 top-6">
                              <div className="rounded-xl bg-surface/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-foreground backdrop-blur-md shadow-sm">
                                {u.type}
                              </div>
                            </div>
                          </div>
                          
                          {/* Content Section */}
                          <div className="flex flex-1 flex-col p-6 lg:p-8">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-2">
                                <h3 className="text-xl font-black leading-tight text-foreground transition-colors group-hover:text-primary">{u.name}</h3>
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="flex items-center rounded-lg bg-muted/50 px-2 py-1 text-[10px] font-bold text-muted-foreground">
                                    <svg className="mr-1.5 h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    {u.capacity} Tamu
                                  </span>
                                  <span className={`flex items-center rounded-lg px-2 py-1 text-[10px] font-bold ${u.available > 2 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
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
                              <p className="mt-6 text-sm font-medium leading-relaxed text-muted line-clamp-2">{u.description}</p>
                            )}

                            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-border/60 pt-8">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted">Per Malam</p>
                                <p className="text-lg font-black text-foreground">{priceRangeLabel(u)}</p>
                              </div>
                              <div className="space-y-1 text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted">Total Menginap</p>
                                <p className="text-xl font-black text-primary italic">{formatIDR(sumDailyPrice(u))}</p>
                              </div>
                            </div>

                            {inc.length > 0 && (
                              <div className="mt-8 rounded-2xl bg-muted/20 p-5">
                                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-muted">Termasuk:</p>
                                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {inc.slice(0, 4).map((t, idx) => (
                                    <li key={idx} className="flex items-center text-[10px] font-bold text-foreground">
                                      <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                      {t}
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
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => setUnitPage((p) => p + 1)}
                    className="rounded-2xl border-2 border-border bg-surface px-8 py-3 text-sm font-bold text-foreground transition-all hover:bg-muted/50"
                  >
                    Lihat Lebih Banyak Unit
                  </button>
                </div>
              )}

              {/* Kavling Selection Section */}
              {(effectiveKavlingScope || kavlingAmbiguous) && (
                <div className="overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-xl shadow-primary/5 transition-all duration-500 hover:shadow-primary/10">
                  <div className="border-b border-border bg-muted/30 px-8 py-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A2 2 0 013 15.483V5.517a2 2 0 011.553-1.943L9 2l6 3 5.447-2.724A2 2 0 0121 4.224v9.966a2 2 0 01-1.553 1.943L15 19l-6 1z" />
                          </svg>
                        </div>
                        <div className="space-y-0.5">
                          <h3 className="text-xl font-black text-foreground">Pilih Lokasi Kavling</h3>
                          <p className="text-xs font-medium text-muted">Tentukan titik camping favorit Anda</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Progres</span>
                          <span className="text-sm font-black text-primary">
                            {kavlingSelected.length} / {requiredKavlings} Kavling
                          </span>
                        </div>
                        <div className="h-10 w-1 rounded-full bg-primary/20">
                          <div 
                            className="h-full w-full rounded-full bg-primary transition-all duration-500" 
                            style={{ height: `${requiredKavlings > 0 ? (kavlingSelected.length / requiredKavlings) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="rounded-2xl bg-primary/[0.03] p-5 border border-primary/10">
                          {kavlingAmbiguous ? (
                            <div className="space-y-4">
                              {combinedAll ? (
                                <p className="text-sm font-bold text-foreground leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/30 underline-offset-4">{requiredKavlings} kavling</span> untuk paket yang Anda pilih.</p>
                              ) : combinedNonPrivate ? (
                                <p className="text-sm font-bold text-foreground leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/30 underline-offset-4">{requiredKavlings} kavling</span> untuk Paket + Camping Mandiri.</p>
                              ) : (
                                <div className="flex flex-col gap-4">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Pilih Kategori Kavling</span>
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    {kavlingQtyByGroup.mandiri > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("mandiri")}
                                        className={`group relative overflow-hidden rounded-2xl px-6 py-3 text-xs font-black transition-all ${kavlingScopePick === "mandiri" ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20" : "bg-surface border-2 border-border text-foreground hover:border-primary/40"}`}
                                      >
                                        <span className="relative z-10">Camping Mandiri</span>
                                      </button>
                                    )}
                                    {kavlingQtyByGroup.paket > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("paket")}
                                        className={`group relative overflow-hidden rounded-2xl px-6 py-3 text-xs font-black transition-all ${kavlingScopePick === "paket" ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20" : "bg-surface border-2 border-border text-foreground hover:border-primary/40"}`}
                                      >
                                        <span className="relative z-10">Paket</span>
                                      </button>
                                    )}
                                    {kavlingQtyByGroup.private > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setKavlingScopePick("private")}
                                        className={`group relative overflow-hidden rounded-2xl px-6 py-3 text-xs font-black transition-all ${kavlingScopePick === "private" ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20" : "bg-surface border-2 border-border text-foreground hover:border-primary/40"}`}
                                      >
                                        <span className="relative z-10">Paket Private</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-foreground leading-relaxed">Silakan pilih <span className="text-primary font-black underline decoration-primary/30 underline-offset-4">{requiredKavlings} kavling</span> untuk {effectiveKavlingScope}.</p>
                          )}
                        </div>
                        {hold?.expiresAt && holdLeftLabel && (
                          <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-[11px] font-black text-amber-600 border border-amber-100">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 animate-pulse">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            Sesi pemilihan berakhir dalam {holdLeftLabel}
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
                        className="group flex h-14 shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-surface px-8 text-sm font-black text-foreground transition-all hover:bg-muted active:scale-95 lg:w-auto"
                      >
                        <svg className="mr-3 h-5 w-5 text-primary transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                        Lihat Peta Interaktif
                      </button>
                    </div>

                    <div className="flex flex-col gap-10 lg:flex-row">
                      {/* Map Preview */}
                      <div className="shrink-0 lg:w-1/3">
                        <button
                          type="button"
                          onClick={() => {
                            setKavlingMapAssetVersion(Date.now());
                            setKavlingMapZoom(1);
                            setKavlingMapOpen(true);
                          }}
                          className="group relative block aspect-video w-full overflow-hidden rounded-[2rem] border-2 border-border bg-muted/5 transition-all hover:border-primary/30"
                        >
                          <img
                            src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            alt="Site Map Kavling"
                            className="h-full w-full object-contain cursor-zoom-in transition-all duration-700 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 backdrop-blur-0 transition-all duration-500 group-hover:bg-black/10 group-hover:backdrop-blur-[2px]">
                            <div className="flex translate-y-4 flex-col items-center gap-2 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface shadow-2xl">
                                <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Zoom Peta</span>
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
                                className={`flex h-11 items-center justify-center rounded-xl border-2 text-[11px] font-black transition-all duration-300 ${
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-110 rotate-2 z-10"
                                    : isTaken
                                    ? "border-destructive/10 bg-destructive/5 text-destructive/30 cursor-not-allowed"
                                    : disabled
                                    ? "border-border bg-muted/30 text-muted opacity-40 cursor-not-allowed"
                                    : "border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary/5 hover:-translate-y-1"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-8 flex flex-wrap gap-6 border-t border-border/50 pt-6">
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 rounded-lg border-2 border-primary bg-primary shadow-lg shadow-primary/20 rotate-3" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Terpilih</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 rounded-lg border-2 border-border bg-surface" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Tersedia</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 rounded-lg border-2 border-destructive/10 bg-destructive/5" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Terisi</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 rounded-lg border-2 border-border bg-muted/30" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Tidak Sesuai</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {holdError ? (
                      <div className="mt-8 animate-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-4 rounded-[1.5rem] border-2 border-destructive/20 bg-destructive/5 p-6 text-sm font-black text-destructive">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div className="space-y-1">
                            <p className="uppercase tracking-wider">Kesalahan Pemilihan</p>
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
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              kavlingMapManualZoomRef.current = true;
                              setKavlingMapZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))));
                            }}
                            disabled={kavlingMapZoom <= 1}
                            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
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
                            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
                          >
                            100%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              kavlingMapManualZoomRef.current = true;
                              setKavlingMapZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
                            }}
                            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
                          >
                            +
                          </button>
                          <a
                            href={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
                          >
                            Buka Tab Baru
                          </a>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-xs text-muted">Arahkan kursor ke gambar untuk zoom (otomatis).</div>
                          <div className="text-xs text-muted">Zoom: {Math.round(kavlingMapZoom * 100)}%</div>
                        </div>
                      </div>

                      <div
                        className={`max-h-[70dvh] overflow-auto rounded-xl border border-border bg-background ${kavlingMapDragging ? "cursor-grabbing" : "cursor-grab"}`}
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
                    <p className="text-sm font-medium text-muted">Lengkapi kenyamanan menginap Anda dengan add-ons pilihan.</p>
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
                        className={`group relative overflow-hidden rounded-[2rem] border-2 p-6 transition-all duration-700 ${
                          isSelected 
                            ? "border-primary bg-primary/[0.03] shadow-xl shadow-primary/10" 
                            : "border-border bg-surface hover:border-primary/40 hover:shadow-md"
                        }`}
                      >
                        {/* Decorative background for selected */}
                        {isSelected && (
                          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10" />
                        )}

                        <div className="flex flex-col gap-6">
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-lg font-black text-foreground leading-tight group-hover:text-primary transition-colors">{a.name}</h4>
                              {auto > 0 && (
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-primary">
                                  Included
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className="text-lg font-black text-primary">{formatIDR(a.price)}</span>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">/ item</span>
                            </div>
                            {auto > 0 && (
                              <p className="mt-2 text-[10px] font-bold text-primary/60 italic">
                                * {auto} unit sudah termasuk dalam paket Anda
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between pt-4 border-t border-border/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Jumlah</span>
                            <div className="scale-110">
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
                  <div className="rounded-[2rem] border-2 border-dashed border-border bg-muted/10 p-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/20">
                      <svg className="h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </div>
                    <h4 className="mt-6 text-lg font-black text-foreground">Tidak Ada Add-On</h4>
                    <p className="mt-2 text-sm font-medium text-muted">Belum ada fasilitas tambahan yang tersedia saat ini.</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="relative overflow-hidden rounded-[2rem] border-2 border-destructive/20 bg-destructive/5 p-6 shadow-2xl shadow-destructive/10 backdrop-blur-xl">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-destructive/10 blur-2xl" />
                    <div className="flex items-center gap-5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-inner">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-destructive/60">Perhatian Diperlukan</span>
                        <span className="text-sm font-black text-destructive leading-relaxed">{error}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {guestOverCapacity && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="relative overflow-hidden rounded-[2rem] border-2 border-amber-500/20 bg-amber-500/5 p-6 shadow-2xl shadow-amber-500/10 backdrop-blur-xl">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
                    <div className="flex items-center gap-5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shadow-inner">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600/60">Kapasitas Penuh</span>
                        <span className="text-sm font-black text-amber-700 leading-relaxed">Total tamu melebihi kapasitas paket yang dipilih. Mohon sesuaikan jumlah tamu atau pilih paket lain.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

                  <div className="flex flex-col gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={submitting || loading || guestOverCapacity || selectedVisibleCount === 0}
                      className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-primary px-10 text-sm font-black text-primary-foreground shadow-2xl shadow-primary/30 transition-all hover:bg-primary/90 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:shadow-none"
                    >
                      {submitting || loading ? (
                        <div className="flex items-center gap-3">
                          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Memproses...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>Konfirmasi Booking</span>
                          <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="group flex h-14 w-full items-center justify-center rounded-2xl border-2 border-border bg-surface px-8 text-sm font-black text-foreground transition-all hover:bg-muted active:scale-95"
                    >
                      <svg className="mr-2 h-5 w-5 text-primary transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Kembali ke Data Tamu
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
  </div>
)}
</div>
</div>
);
}
