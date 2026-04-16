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

  const btnClass = size === "sm" ? "h-9 w-9 text-base" : "h-10 w-10 text-lg";
  const midClass = size === "sm" ? "min-w-8 px-2 text-sm" : "min-w-10 px-3 text-sm";

  return (
    <div className="inline-flex w-fit items-center rounded-xl border border-border bg-surface">
      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${btnClass} rounded-l-xl text-foreground hover:bg-background disabled:opacity-40`}
        aria-label={`Kurangi ${ariaLabel}`}
      >
        −
      </button>
      <div className={`${midClass} text-center font-semibold text-foreground`} aria-label={ariaLabel}>
        {value}
      </div>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        className={`${btnClass} rounded-r-xl text-foreground hover:bg-background disabled:opacity-40`}
        aria-label={`Tambah ${ariaLabel}`}
      >
        +
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

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [totalGuest, setTotalGuest] = useState(1);
  const [specialRequest, setSpecialRequest] = useState("");

  const [units, setUnits] = useState<AvailabilityUnit[]>([]);
  const [addons, setAddons] = useState<AvailabilityAddOn[]>([]);
  const [unitQty, setUnitQty] = useState<Record<string, number>>({});
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className={`${success ? "no-print " : ""}rounded-3xl border border-border bg-surface/80 p-6 shadow-sm backdrop-blur`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <img src="/brand/logowf.png" alt="Woodforest" className="h-28 w-28 shrink-0 rounded-xl object-contain sm:h-40 sm:w-40" />
            </div>
            <div className="sm:-mt-1">
              <div className="text-xs font-medium text-muted">Woodforest Jayagiri 48 · Lembang</div>
              <h1 className="font-title mt-1 text-[36px] font-semibold leading-tight text-foreground sm:text-[40px]">Booking Camping</h1>
              <p className="mt-2 text-sm text-muted">
                Grounded, calm, warm. Pilih tanggal, pilih paket, dan kami siapkan pengalaman yang tenang di alam untuk bonding keluarga.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">Quiet nature</div>
                <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">Family bonding</div>
                <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">Wellness</div>
                <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">Light adventure</div>
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
          <>
            <form onSubmit={onSubmit} className="mt-6 space-y-6 pb-28">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="text-sm font-semibold text-foreground">Tanggal & Preferensi</div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-foreground">
                      Check-in <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-foreground">
                      Check-out <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-semibold text-foreground">
                      Nama Lengkap <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-foreground">
                      Total Guest <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={totalGuest}
                      onChange={(e) => setTotalGuest(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                    {totalCapacity ? (
                      <div className="text-xs text-muted">Kapasitas terpilih: {totalCapacity}</div>
                    ) : null}
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-semibold text-foreground">
                      Nomor WhatsApp <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-foreground">
                      Email <span aria-hidden="true" className="text-amber-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-sm font-semibold text-foreground">Special Request (opsional)</label>
                    <textarea
                      value={specialRequest}
                      onChange={(e) => setSpecialRequest(e.target.value)}
                      className="h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder="Contoh: minta lokasi dekat toilet, bawa anak kecil, request check-in lebih awal (jika memungkinkan)..."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="text-sm font-semibold text-foreground">Filter</div>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:w-auto"
                    >
                      <option value="">Semua Type</option>
                      {typeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:w-auto"
                    >
                      <option value="">Semua Kategori</option>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="self-end text-xs text-muted sm:self-auto">
                    {loading ? "Loading..." : `${pagedVisibleUnits.length}/${visibleUnits.length} item`}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {pagedVisibleUnits.map((u) => {
                    const inc = parseIncludesJson(u.includesJson);
                    const images = parseImagesJson(u.imagesJson);
                    const facilities = parseFacilitiesJson(u.facilitiesJson);
                    return (
                      <div key={u.id} className="rounded-2xl border border-border bg-surface p-4">
                        <div className="mb-3">
                          <ImageCarousel images={images} heightClassName="h-36" />
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{u.name}</div>
                            <div className="mt-1 text-xs text-muted">
                              Kapasitas {u.capacity} · Tersedia {u.available}
                            </div>
                            {u.description ? (
                              <div className="mt-2 text-xs text-muted">{u.description}</div>
                            ) : null}
                            {facilities.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {facilities.map((k) => (
                                  <div
                                    key={k}
                                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground"
                                  >
                                    {FACILITY_LABEL_BY_KEY[k] ?? k}
                                  </div>
                                ))}
                              </div>
                            ) : null}
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

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-border bg-background px-3 py-2">
                            <div className="text-[11px] text-muted">Total (tanggal ini)</div>
                            <div className="text-sm font-semibold text-foreground">{formatIDR(sumDailyPrice(u))}</div>
                          </div>
                          <div className="rounded-xl border border-border bg-background px-3 py-2">
                            <div className="text-[11px] text-muted">Per malam</div>
                            <div className="text-sm font-semibold text-foreground">{priceRangeLabel(u)}</div>
                          </div>
                        </div>

                        {inc.length ? (
                          <ul className="mt-3 list-disc pl-5 text-xs text-muted">
                            {inc.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                  {visibleUnits.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted sm:col-span-2">
                      Tidak ada item untuk filter ini
                    </div>
                  ) : null}
                </div>
                {visibleUnits.length > shownUnitBaseCount ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setUnitPage((p) => p + 1)}
                      className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
                    >
                      Tampilkan lebih banyak
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-muted">Paket dipilih: {selectedVisibleCount}</div>

                {effectiveKavlingScope || kavlingAmbiguous ? (
                  <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Pilih Kavling</div>
                        <div className="mt-1 text-xs text-muted">
                          {kavlingAmbiguous ? (
                            <div className="space-y-2">
                              {combinedAll ? (
                                <div>
                                  Pilih {requiredKavlings} kavling untuk Paket + Camping Mandiri + Paket Private (Private: x{kavlingQtyByGroup.private}
                                  {kavlingPrivateRange ? ` • range ${kavlingPrivateRange.start}-${kavlingPrivateRange.end}` : ""}).
                                </div>
                              ) : combinedNonPrivate ? (
                                <div>Pilih {requiredKavlings} kavling untuk Paket + Camping Mandiri.</div>
                              ) : (
                                <>
                                  <div>Untuk pilih kavling, pilih qty hanya di salah satu: Paket / Paket Private / Camping Mandiri (atau filter kategori).</div>
                                  <div className="flex flex-wrap items-end gap-2">
                                    <div className="space-y-1">
                                      <label className="text-xs font-medium text-foreground">Pilih untuk</label>
                                      <select
                                        value={kavlingScopePick || ""}
                                        onChange={(e) => setKavlingScopePick(e.target.value as any)}
                                        className="h-8 rounded-lg border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
                                      >
                                        <option value="">Pilih...</option>
                                        {kavlingQtyByGroup.mandiri > 0 && <option value="mandiri">Camping Mandiri</option>}
                                        {kavlingQtyByGroup.paket > 0 && <option value="paket">Paket</option>}
                                        {kavlingQtyByGroup.private > 0 && <option value="private">Paket Private</option>}
                                      </select>
                                    </div>
                                    <div className="text-xs text-muted pb-2">
                                      {effectiveKavlingScope === "private" && kavlingPrivateRange 
                                        ? `Range: ${kavlingPrivateRange.start}-${kavlingPrivateRange.end}` 
                                        : ""}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div>
                              Pilih {requiredKavlings} kavling ({effectiveKavlingScope}) 
                              {effectiveKavlingScope === "private" && kavlingPrivateRange ? ` • range ${kavlingPrivateRange.start}-${kavlingPrivateRange.end}` : ""}.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-xs font-medium text-foreground">
                          {kavlingSelected.length}/{requiredKavlings} dipilih
                        </div>
                        {hold?.expiresAt && holdLeftLabel ? (
                          <div className="text-[11px] font-semibold text-amber-700">
                            Hold berakhir dalam {holdLeftLabel}
                          </div>
                        ) : null}
                        {kavlingLoading && <div className="text-[10px] text-muted animate-pulse">Menyiapkan kavling...</div>}
                      </div>
                    </div>

                    <div className="mt-4 flex max-h-[70dvh] flex-col gap-4 sm:max-h-none">
                      <div className="shrink-0 overflow-hidden rounded-2xl border border-border bg-surface">
                        <button
                          type="button"
                          onClick={() => {
                            setKavlingMapAssetVersion(Date.now());
                            setKavlingMapZoom(1);
                            setKavlingMapOpen(true);
                          }}
                          className="group block w-full"
                          aria-label="Buka zoom Site Map Kavling"
                        >
                          <img
                            src={`/kavling/site-map.png?v=${kavlingMapAssetVersion}`}
                            alt="Site Map Kavling"
                            className="h-56 w-full object-contain sm:h-72 md:h-96 cursor-zoom-in transition-opacity group-hover:opacity-95"
                            loading="lazy"
                          />
                        </button>
                      </div>

                      <div className="min-h-0 flex-1 overflow-auto">
                        <div className="grid grid-cols-5 gap-2 pr-1 sm:grid-cols-10">
                          {kavlingAll.map((n) => {
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
                                className={`flex h-10 items-center justify-center rounded-xl border text-xs font-bold transition-all ${
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                    : isTaken
                                    ? "border-red-200 bg-red-50 text-red-400 cursor-not-allowed opacity-60"
                                    : disabled
                                    ? "border-border bg-muted/30 text-muted opacity-40 cursor-not-allowed"
                                    : "border-border bg-surface text-foreground hover:border-primary hover:bg-primary/5"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {holdError && <div className="mt-2 text-[11px] text-red-600 font-medium">{holdError}</div>}
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

              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="text-sm font-semibold text-foreground">Add-Ons (Opsional)</div>
                <div className="mt-4 overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-background text-muted">
                      <tr>
                        <th className="px-4 py-2 font-medium">Nama</th>
                        <th className="px-4 py-2 font-medium">Harga</th>
                        <th className="px-4 py-2 font-medium text-center">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {addons.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                          <td className="px-4 py-3 text-muted">{formatIDR(a.price)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
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
                          </td>
                        </tr>
                      ))}
                      {addons.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-muted" colSpan={3}>
                            Belum ada add-on
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
              )}

              {guestOverCapacity && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Total guest melebihi kapasitas paket yang dipilih.
                </div>
              )}

              <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/90 backdrop-blur">
                <div className="mx-auto max-w-4xl px-4 py-4">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <div>
                      <div className="text-xs text-muted">Estimasi total</div>
                      <div className="text-lg font-semibold text-foreground">{formatIDR(estimatedAmount)}</div>
                      <div className="text-xs text-muted">Final total dihitung server saat submit.</div>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || loading || guestOverCapacity || selectedVisibleCount === 0}
                      className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {submitting ? "Memproses..." : "Buat Booking"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
