"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatIDR, formatTimeWIB } from "@/lib/format";
import { addDaysWIB, formatDateWIB, parseDateWIB } from "@/lib/time";
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
  available: number;
  daily?: Array<{ date: string; price: number; allotment: number; booked: number; available: number }>;
};

type AvailabilityAddOn = { id: string; name: string; price: number };

function deriveCategory(u: AvailabilityUnit) {
  const scope = (u.kavlingScope ?? "").toLowerCase();
  if (scope === "private" || scope === "mandiri" || scope === "paket") return scope;
  const raw = (u.category ?? "").toLowerCase();
  if (raw.includes("private")) return "private";
  if (raw.includes("mandiri") || raw.includes("kavling")) return "mandiri";
  if (raw.includes("paket")) return "paket";
  if (raw === "unit") return "unit";
  const n = u.name.toLowerCase();
  if (n.includes("private")) return "private";
  if (n.startsWith("paket ")) return "paket";
  if (n.includes("mandiri") || n.includes("kavling")) return "mandiri";
  return "unit";
}

function iso(d: Date) {
  return formatDateWIB(d);
}

function addDaysISO(isoDate: string, days: number) {
  return formatDateWIB(addDaysWIB(parseDateWIB(isoDate), days));
}

function sumDailyPrice(u: AvailabilityUnit) {
  const daily = u.daily ?? [];
  if (!daily.length) return 0;
  return daily.reduce((acc, x) => acc + x.price, 0);
}

function QuantityStepper({
  value,
  min = 0,
  max,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const decDisabled = disabled || value <= min;
  const incDisabled = disabled || (typeof max === "number" ? value >= max : false);

  return (
    <div className="inline-flex w-fit items-center gap-1 p-1 rounded-xl border border-border bg-surface shadow-sm transition-all hover:border-primary/20">
      <button
        type="button"
        disabled={decDisabled}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-foreground hover:bg-background active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
        aria-label={`Kurangi ${ariaLabel}`}
      >
        −
      </button>
      <div className="min-w-[2.5rem] px-1 text-center text-sm font-black text-foreground tabular-nums" aria-label={ariaLabel}>
        {value}
      </div>
      <button
        type="button"
        disabled={incDisabled}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-foreground hover:bg-background active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
        aria-label={`Tambah ${ariaLabel}`}
      >
        +
      </button>
    </div>
  );
}

export function AdminBookingCreate() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const siteMapVersion = useMemo(() => Date.now(), []);
  const [checkIn, setCheckIn] = useState(iso(today));
  const [checkOut, setCheckOut] = useState(iso(new Date(today.getTime() + 24 * 60 * 60 * 1000)));
  const [type, setType] = useState<"" | "tenda" | "cabin">("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [totalGuest, setTotalGuest] = useState(1);
  const [adultPax, setAdultPax] = useState(1);
  const [child5to10Pax, setChild5to10Pax] = useState(0);
  const [childUnder5Pax, setChildUnder5Pax] = useState(0);
  const [status, setStatus] = useState<"pending" | "paid">("pending");

  useEffect(() => {
    setTotalGuest(adultPax + child5to10Pax + childUnder5Pax);
  }, [adultPax, child5to10Pax, childUnder5Pax]);
  const [dpMode, setDpMode] = useState<"none" | "percent" | "nominal">("none");
  const [dpValue, setDpValue] = useState<number>(0);
  const [seedPaymentKind, setSeedPaymentKind] = useState<"unpaid" | "dp_paid" | "paid">("unpaid");
  const [seedDpMode, setSeedDpMode] = useState<"percent" | "nominal">("percent");
  const [seedDpValue, setSeedDpValue] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<AvailabilityUnit[]>([]);
  const [addOns, setAddOns] = useState<AvailabilityAddOn[]>([]);
  const [unitQty, setUnitQty] = useState<Record<string, number>>({});
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [settlementLinking, setSettlementLinking] = useState(false);
  const [success, setSuccess] = useState<{ code: string; amount: number } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Array<{ code: string; label: string; feeFlat: number; feeBps: number }>>([]);
  const [paymentMethodCode, setPaymentMethodCode] = useState<string>("");

  const [kavlingAll, setKavlingAll] = useState<number[]>([]);
  const [kavlingTaken, setKavlingTaken] = useState<number[]>([]);
  const [kavlingPaid, setKavlingPaid] = useState<number[]>([]);
  const [kavlingHeld, setKavlingHeld] = useState<number[]>([]);
  const [kavlingOOO, setKavlingOOO] = useState<number[]>([]);
  const [kavlingSelected, setKavlingSelected] = useState<number[]>([]);
  const [kavlingLoading, setKavlingLoading] = useState(false);
  const [kavlingError, setKavlingError] = useState<string | null>(null);
  const [kavlingPrivateRange, setKavlingPrivateRange] = useState<null | { start: number; end: number }>(null);
  const [kavlingSellCount, setKavlingSellCount] = useState<number | null>(null);
  const [hold, setHold] = useState<null | { id: string; token: string; expiresAt: string }>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdHeartbeat, setHoldHeartbeat] = useState(0);

  // Real-time kavling updates
  useEffect(() => {
    const es = new EventSource("/api/public/kavlings/realtime");
    es.onmessage = () => {
      setHoldHeartbeat((x) => x + 1);
    };
    es.onerror = () => {
      es.close();
      setTimeout(() => setHoldHeartbeat((x) => x + 1), 5000);
    };
    return () => es.close();
  }, []);

  const [kavlingMapOpen, setKavlingMapOpen] = useState(false);
  const [kavlingMapHover, setKavlingMapHover] = useState(false);
  const [kavlingMapOrigin, setKavlingMapOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 });

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
      void releaseHold({ id: holdId, token: holdToken });
    };
  }, [hold?.id, hold?.token]);

  async function loadAvailability() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/public/availability", window.location.origin);
    url.searchParams.set("checkIn", checkIn);
    url.searchParams.set("checkOut", checkOut);
    if (type) url.searchParams.set("type", type);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as { units?: AvailabilityUnit[]; addOns?: AvailabilityAddOn[]; message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal load availability");
      setLoading(false);
      return;
    }
    setUnits(data?.units ?? []);
    setAddOns(data?.addOns ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAvailability();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMethods() {
      const res = await fetch("/api/public/payment-methods");
      const data = (await res.json().catch(() => null)) as
        | { items?: Array<{ code?: string; label?: string; feeFlat?: number; feeBps?: number }> }
        | null;
      if (cancelled) return;
      const items = Array.isArray(data?.items)
        ? data!.items
            .map((x) => ({
              code: typeof x?.code === "string" ? x.code.trim().toUpperCase() : "",
              label: typeof x?.label === "string" ? x.label : "",
              feeFlat: Math.max(0, Math.round(Number(x?.feeFlat ?? 0) || 0)),
              feeBps: Math.max(0, Math.min(10_000, Math.round(Number(x?.feeBps ?? 0) || 0))),
            }))
            .filter((x) => x.code && x.label)
        : [];
      setPaymentMethods(items);
      setPaymentMethodCode((prev) => (prev ? prev : items[0]?.code ?? ""));
    }
    void loadMethods();
    return () => {
      cancelled = true;
    };
  }, []);

  const autoAddonQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) {
      const qty = unitQty[u.id] ?? 0;
      if (!qty) continue;

      const process = (addOnId: string, mode: string) => {
        const current = map.get(addOnId) ?? 0;
        if (mode === "per_pax") map.set(addOnId, current + totalGuest * qty);
        else if (mode === "per_adult") map.set(addOnId, current + adultPax * qty);
        else if (mode === "per_child_5_10") map.set(addOnId, current + child5to10Pax * qty);
        else if (mode === "per_unit") map.set(addOnId, current + qty);
        else if (mode === "per_booking") map.set(addOnId, current + 1);
      };

      // Old single autoAddOn logic (backward compatibility)
      const oldAddOnId = u.autoAddOnId ?? "";
      const oldMode = (u.autoAddOnMode ?? "") as "per_pax" | "per_unit" | "per_booking" | "per_adult" | "per_child_5_10" | "";
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
    for (const a of addOns) {
      const manual = addonQty[a.id] ?? 0;
      const auto = autoAddonQty[a.id] ?? 0;
      out[a.id] = manual + auto;
    }
    return out;
  }, [addOns, addonQty, autoAddonQty]);

  const estimatedAmount = useMemo(() => {
    let base = 0;
    for (const u of units) {
      const qty = unitQty[u.id] ?? 0;
      if (!qty) continue;
      base += qty * sumDailyPrice(u);
    }
    const addonAmount = addOns.reduce((acc, a) => acc + (effectiveAddonQty[a.id] ?? 0) * a.price, 0);
    return base + addonAmount;
  }, [units, unitQty, addOns, effectiveAddonQty]);

  const dpAmountEstimate = useMemo(() => {
    if (seedPaymentKind !== "unpaid") return 0;
    if (status !== "pending") return 0;
    if (dpMode === "percent") return Math.max(0, Math.min(estimatedAmount, Math.round((estimatedAmount * dpValue) / 100)));
    if (dpMode === "nominal") return Math.max(0, Math.min(estimatedAmount, Math.round(dpValue)));
    return 0;
  }, [dpMode, dpValue, estimatedAmount, seedPaymentKind, status]);

  const dpPayload = useMemo(() => {
    if (seedPaymentKind !== "unpaid") return null;
    if (status !== "pending") return null;
    if (dpMode === "percent") {
      const v = Number(dpValue);
      if (!Number.isFinite(v) || v <= 0) return null;
      return { mode: "percent" as const, value: v };
    }
    if (dpMode === "nominal") {
      const v = Number(dpValue);
      if (!Number.isFinite(v) || v <= 0) return null;
      return { mode: "nominal" as const, value: v };
    }
    return null;
  }, [dpMode, dpValue, seedPaymentKind, status]);

  const seedPaidAmount = useMemo(() => {
    if (seedPaymentKind === "paid") return Math.max(0, Math.round(Number(estimatedAmount) || 0));
    if (seedPaymentKind !== "dp_paid") return 0;
    const base = Math.max(0, Math.round(Number(estimatedAmount) || 0));
    if (base <= 0) return 0;
    if (seedDpMode === "percent") return Math.max(0, Math.min(base - 1, Math.round((base * Math.max(0, seedDpValue)) / 100)));
    return Math.max(0, Math.min(base - 1, Math.round(Number(seedDpValue) || 0)));
  }, [estimatedAmount, seedDpMode, seedDpValue, seedPaymentKind]);

  const selectedPaymentMethod = useMemo(() => {
    if (!paymentMethodCode) return null;
    return paymentMethods.find((m) => m.code === paymentMethodCode) ?? null;
  }, [paymentMethodCode, paymentMethods]);

  const baseAmountToPay = useMemo(() => {
    if (dpPayload) return Math.max(0, Math.round(Number(dpAmountEstimate) || 0));
    const total = success?.amount ? Math.max(0, Math.round(Number(success.amount) || 0)) : Math.max(0, Math.round(Number(estimatedAmount) || 0));
    if (seedPaymentKind === "dp_paid") return Math.max(0, total - seedPaidAmount);
    if (seedPaymentKind === "paid") return 0;
    return total;
  }, [dpAmountEstimate, dpPayload, estimatedAmount, seedPaidAmount, seedPaymentKind, success?.amount]);

  const serviceFeePreview = useMemo(() => {
    if (!selectedPaymentMethod) return 0;
    const pctFee = Math.max(0, Math.round((baseAmountToPay * Math.max(0, selectedPaymentMethod.feeBps || 0)) / 10_000));
    const flatFee = Math.max(0, Math.round(Number(selectedPaymentMethod.feeFlat) || 0));
    return pctFee + flatFee;
  }, [baseAmountToPay, selectedPaymentMethod]);

  const mandiriQty = useMemo(
    () => units.reduce((acc, u) => acc + (deriveCategory(u) === "mandiri" ? (unitQty[u.id] ?? 0) : 0), 0),
    [units, unitQty],
  );
  const paketQty = useMemo(
    () => units.reduce((acc, u) => acc + (deriveCategory(u) === "paket" ? (unitQty[u.id] ?? 0) : 0), 0),
    [units, unitQty],
  );
  const privateQty = useMemo(
    () => units.reduce((acc, u) => acc + (deriveCategory(u) === "private" ? (unitQty[u.id] ?? 0) : 0), 0),
    [units, unitQty],
  );
  const kavlingAmbiguous = useMemo(
    () => [mandiriQty > 0, privateQty > 0, paketQty > 0].filter(Boolean).length > 1,
    [mandiriQty, paketQty, privateQty],
  );
  const combinedNonPrivate = useMemo(() => privateQty === 0 && mandiriQty > 0 && paketQty > 0, [mandiriQty, paketQty, privateQty]);
  const combinedAll = useMemo(() => privateQty > 0 && (mandiriQty > 0 || paketQty > 0), [mandiriQty, paketQty, privateQty]);
  const [kavlingScopePick, setKavlingScopePick] = useState<"" | "paket" | "private" | "mandiri" | "mixed">("");
  const autoKavlingScope = useMemo(() => {
    const nonZero = [
      { key: "mandiri" as const, qty: mandiriQty },
      { key: "private" as const, qty: privateQty },
      { key: "paket" as const, qty: paketQty },
    ].filter((x) => x.qty > 0);
    return nonZero.length === 1 ? nonZero[0].key : "";
  }, [mandiriQty, paketQty, privateQty]);
  const effectiveKavlingScope = useMemo(() => {
    if (kavlingScopePick) return kavlingScopePick;
    if (combinedAll) return "mixed";
    if (combinedNonPrivate) return "paket";
    return kavlingAmbiguous ? "" : autoKavlingScope;
  }, [autoKavlingScope, combinedAll, combinedNonPrivate, kavlingAmbiguous, kavlingScopePick]);
  const requiredKavlings = useMemo(() => {
    if (combinedAll) return privateQty + mandiriQty + paketQty;
    if (combinedNonPrivate) return mandiriQty + paketQty;
    if (effectiveKavlingScope === "mandiri") return mandiriQty;
    if (effectiveKavlingScope === "private") return privateQty;
    if (effectiveKavlingScope === "paket") return paketQty;
    return 0;
  }, [combinedAll, combinedNonPrivate, effectiveKavlingScope, mandiriQty, paketQty, privateQty]);

  useEffect(() => {
    setKavlingSelected((prev) => prev.slice(0, requiredKavlings));
  }, [requiredKavlings]);

  useEffect(() => {
    if (!requiredKavlings || !effectiveKavlingScope) {
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
    let cancelled = false;
    async function load() {
      setKavlingLoading(true);
      setKavlingError(null);
      const url = new URL("/api/public/kavlings", window.location.origin);
      url.searchParams.set("checkIn", checkIn);
      url.searchParams.set("checkOut", checkOut);
      url.searchParams.set("scope", effectiveKavlingScope);
      if (hold?.id && hold?.token) {
        url.searchParams.set("holdId", hold.id);
        url.searchParams.set("holdToken", hold.token);
      }
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as
        | { all?: number[]; taken?: number[]; paid?: number[]; held?: number[]; ooo?: number[]; sellCount?: number; privateRange?: { start?: number; end?: number }; message?: string }
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
      setKavlingAll((data?.all ?? []).filter((n) => typeof n === "number"));
      setKavlingTaken((data?.taken ?? []).filter((n) => typeof n === "number"));
      setKavlingPaid((data?.paid ?? []).filter((n) => typeof n === "number"));
      setKavlingHeld((data?.held ?? []).filter((n) => typeof n === "number"));
      setKavlingOOO((data?.ooo ?? []).filter((n) => typeof n === "number"));
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
  }, [checkIn, checkOut, effectiveKavlingScope, requiredKavlings, hold?.id, hold?.token, holdHeartbeat]);

  useEffect(() => {
    if (!requiredKavlings || !effectiveKavlingScope) return;
    const t = setInterval(() => setHoldHeartbeat((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [checkIn, checkOut, effectiveKavlingScope, requiredKavlings]);

  useEffect(() => {
    if (!requiredKavlings || !effectiveKavlingScope) return;

    if (kavlingSelected.length !== requiredKavlings) {
      if (hold?.id && hold?.token) void releaseHold(hold);
      setHold(null);
      setHoldError(null);
      return;
    }
    if (kavlingSelected.some((n) => kavlingTaken.includes(n))) {
      // Trust backend to handle final conflict check
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setHoldSubmitting(true);
      setHoldError(null);
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
  }, [checkIn, checkOut, effectiveKavlingScope, hold?.id, hold?.token, kavlingSelected, kavlingTaken, requiredKavlings]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const items = Object.entries(unitQty)
      .map(([unitId, quantity]) => ({ unitId, quantity }))
      .filter((x) => x.quantity > 0);
    const addOnsPayload = Object.entries(effectiveAddonQty)
      .map(([addOnId, quantity]) => ({ addOnId, quantity }))
      .filter((x) => x.quantity > 0);

    if (kavlingAmbiguous && !combinedNonPrivate && !combinedAll && !effectiveKavlingScope) {
      setError("Pilih kategori untuk set kavling: Paket / Paket Private / Camping Mandiri.");
      setSubmitting(false);
      return;
    }
    if (requiredKavlings > 0 && kavlingSelected.length !== requiredKavlings) {
      setError(
        `Pilih ${requiredKavlings} kavling untuk ${
          combinedAll
            ? "Paket + Camping Mandiri + Paket Private"
            : combinedNonPrivate
            ? "Paket + Camping Mandiri"
            : effectiveKavlingScope === "mixed"
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

    const res = await fetch("/api/bookings/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer: { name, phone, email: email ? email : null },
        checkIn,
        checkOut,
        totalGuest,
        adultPax,
        child5to10Pax,
        childUnder5Pax,
        status,
        paymentSeed: { kind: seedPaymentKind, paidAmount: seedPaidAmount },
        dp: dpPayload ?? undefined,
        hold: requiredKavlings && hold ? { id: hold.id, token: hold.token } : undefined,
        kavlings: requiredKavlings ? kavlingSelected : [],
        items,
        addOns: addOnsPayload,
      }),
    });
    const data = (await res.json().catch(() => null)) as { code?: string; amount?: number; message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal membuat booking");
      setSubmitting(false);
      return;
    }
    setSuccess({ code: data?.code ?? "-", amount: data?.amount ?? 0 });
    setHold(null);
    setHoldError(null);
    setHoldSubmitting(false);
    setSubmitting(false);
  }

  async function payWithXendit() {
    if (!success) return;
    setPaying(true);
    setError(null);
    try {
      const mode = dpPayload ? "dp" : "balance";
      const url = new URL(`/api/public/bookings/${success.code}/pay`, window.location.origin);
      url.searchParams.set("mode", mode);
      if (paymentMethodCode) url.searchParams.set("pm", paymentMethodCode);
      const res = await fetch(url.toString(), { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Gagal membuat invoice");
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses pembayaran");
    } finally {
      setPaying(false);
    }
  }

  async function createSettlementLink() {
    if (!success) return;
    setSettlementLinking(true);
    setError(null);
    try {
      const url = new URL(`/api/public/bookings/${success.code}/pay`, window.location.origin);
      url.searchParams.set("mode", "balance");
      if (paymentMethodCode) url.searchParams.set("pm", paymentMethodCode);
      const res = await fetch(url.toString(), { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Gagal membuat link pelunasan");
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat link pelunasan");
    } finally {
      setSettlementLinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tambah Booking Manual</h1>
          <p className="text-sm text-muted">Untuk booking dari WhatsApp / offline.</p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="flex min-h-[3.25rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-sm font-bold text-foreground hover:bg-background transition-all active:scale-95"
        >
          Kembali
        </Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold text-foreground">Tanggal & Customer</div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Check-in</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Check-out</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "" | "tenda" | "cabin")}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Semua</option>
                <option value="tenda">Tenda</option>
                <option value="cabin">Cabin</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Nama</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-3 sm:col-span-2 rounded-2xl border border-border bg-background p-4">
              <label className="text-sm font-bold text-foreground uppercase tracking-widest">Konfigurasi Tamu</label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Dewasa (10+ thn)</label>
                  <input
                    type="number"
                    min={1}
                    value={adultPax}
                    onChange={(e) => setAdultPax(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Anak (5-10 thn)</label>
                  <input
                    type="number"
                    min={0}
                    value={child5to10Pax}
                    onChange={(e) => setChild5to10Pax(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Balita (&lt;5 thn)</label>
                  <input
                    type="number"
                    min={0}
                    value={childUnder5Pax}
                    onChange={(e) => setChildUnder5Pax(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="text-xs text-muted italic">Total: {totalGuest} Tamu. (Hanya Dewasa yang dihitung kapasitas)</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Email (opsional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Pembayaran sebelumnya</label>
              <select
                value={seedPaymentKind}
                onChange={(e) => {
                  const next = e.target.value as "unpaid" | "dp_paid" | "paid";
                  setSeedPaymentKind(next);
                  if (next !== "unpaid") {
                    setDpMode("none");
                    setDpValue(0);
                  }
                  if (next !== "dp_paid") {
                    setSeedDpValue(0);
                  }
                }}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="unpaid">Belum dibayar (normal)</option>
                <option value="dp_paid">Sudah DP (manual)</option>
                <option value="paid">Sudah lunas (manual)</option>
              </select>
            </div>
            <div className="space-y-1">
              {seedPaymentKind === "dp_paid" ? (
                <>
                  <label className="text-sm font-medium text-foreground">DP sudah dibayar</label>
                  <div className="flex gap-2">
                    <select
                      value={seedDpMode}
                      onChange={(e) => setSeedDpMode(e.target.value as "percent" | "nominal")}
                      className="w-32 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="percent">%</option>
                      <option value="nominal">Rp</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={seedDpMode === "percent" ? 100 : undefined}
                      value={seedDpValue}
                      onChange={(e) => setSeedDpValue(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="text-xs text-muted">Nominal DP tersimpan: {formatIDR(seedPaidAmount)}</div>
                </>
              ) : (
                <>
                  <label className="text-sm font-medium text-foreground">Rencana DP (untuk invoice DP)</label>
                  <select
                    value={dpMode}
                    onChange={(e) => {
                      const next = e.target.value as "none" | "percent" | "nominal";
                      setDpMode(next);
                      if (next === "none") setDpValue(0);
                    }}
                    disabled={seedPaymentKind !== "unpaid"}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="none">Tidak ada</option>
                    <option value="percent">Persen (%)</option>
                    <option value="nominal">Nominal</option>
                  </select>
                </>
              )}
            </div>
            {seedPaymentKind === "unpaid" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{dpMode === "percent" ? "DP (%)" : "DP (Rp)"}</label>
                <input
                  type="number"
                  min={0}
                  max={dpMode === "percent" ? 100 : undefined}
                  value={dpValue}
                  onChange={(e) => setDpValue(Number(e.target.value))}
                  disabled={dpMode === "none"}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                />
                {dpMode !== "none" ? <div className="text-xs text-muted">Estimasi DP: {formatIDR(dpAmountEstimate)}</div> : null}
              </div>
            ) : null}
            <div className="flex items-end justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={loadAvailability}
                className="flex min-h-[3.25rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-sm font-bold text-foreground hover:bg-background disabled:opacity-60 transition-all active:scale-95"
              >
                {loading ? "Loading..." : "Load Availability"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold text-foreground">Pilih Unit</div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {units.map((u) => (
              <div key={u.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{u.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      Tersedia {u.available} · Kapasitas {u.capacity}
                    </div>
                  </div>
                  <QuantityStepper
                    value={unitQty[u.id] ?? 0}
                    min={0}
                    max={u.available}
                    disabled={u.available <= 0}
                    ariaLabel={`qty ${u.name}`}
                    onChange={(next) => setUnitQty((s) => ({ ...s, [u.id]: Math.max(0, Math.min(u.available, next)) }))}
                  />
                </div>
                <div className="mt-3 text-xs text-muted">Total (range): {formatIDR(sumDailyPrice(u))}</div>
              </div>
            ))}
            {units.length === 0 ? <div className="text-sm text-muted sm:col-span-2">Tidak ada unit.</div> : null}
          </div>
        </div>

        {requiredKavlings || kavlingAmbiguous ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Kavling</div>
                {kavlingAmbiguous && !combinedNonPrivate && !combinedAll ? (
                  <div className="mt-1 space-y-2">
                    <div className="text-xs text-red-600">Untuk set kavling, pilih salah satu saja: Paket / Paket Private / Camping Mandiri.</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Pilih untuk</label>
                        <select
                          value={kavlingScopePick}
                          onChange={(e) => setKavlingScopePick(e.target.value as "" | "paket" | "private" | "mandiri" | "mixed")}
                          className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                        >
                          <option value="">Pilih</option>
                          {paketQty > 0 ? <option value="paket">Paket</option> : null}
                          {privateQty > 0 ? <option value="private">Paket Private</option> : null}
                          {mandiriQty > 0 ? <option value="mandiri">Camping Mandiri</option> : null}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted">
                    Pilih {requiredKavlings} kavling untuk{" "}
                    {combinedAll
                      ? `Paket + Camping Mandiri + Paket Private${kavlingPrivateRange ? ` (Private: ${kavlingPrivateRange.start}-${kavlingPrivateRange.end})` : ""}`
                      : combinedNonPrivate
                        ? "Paket + Camping Mandiri"
                        : effectiveKavlingScope === "mixed"
                          ? "Paket + Camping Mandiri + Paket Private"
                          : effectiveKavlingScope === "mandiri"
                            ? "Camping Mandiri"
                            : effectiveKavlingScope === "private"
                              ? "Paket Private"
                              : "Paket"}
                    .
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setKavlingMapOpen(true)}
                  className="flex min-h-[3rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-xs font-bold text-foreground hover:bg-background transition-all active:scale-95 shadow-sm"
                >
                  Lihat map
                </button>
                <button
                  type="button"
                  disabled={!requiredKavlings || kavlingLoading || !effectiveKavlingScope}
                  onClick={() => {
                    const taken = new Set(kavlingTaken);
                    const pr = kavlingPrivateRange;
                    const privateNeed = combinedAll ? privateQty : 0;
                    const nonNeed = combinedAll ? mandiriQty + paketQty : 0;
                    const picked = [...kavlingSelected];
                    for (const n of kavlingAll) {
                      if (picked.length >= requiredKavlings) break;
                      if (taken.has(n)) continue;
                      if (picked.includes(n)) continue;
                      if (combinedAll && pr) {
                        const inPrivate = n >= pr.start && n <= pr.end;
                        const privatePicked = picked.filter((x) => x >= pr.start && x <= pr.end).length;
                        const nonPicked = picked.length - privatePicked;
                        if (inPrivate && privatePicked >= privateNeed) continue;
                        if (!inPrivate && nonPicked >= nonNeed) continue;
                      }
                      picked.push(n);
                    }
                    setKavlingSelected(picked.slice(0, requiredKavlings));
                  }}
                  className="flex min-h-[3rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-xs font-bold text-foreground hover:bg-background disabled:opacity-60 transition-all active:scale-95 shadow-sm"
                >
                  Pilih otomatis
                </button>
                <button
                  type="button"
                  disabled={!kavlingSelected.length}
                  onClick={() => {
                    if (hold?.id && hold?.token) void releaseHold(hold);
                    setHold(null);
                    setHoldError(null);
                    setKavlingSelected([]);
                    setHoldHeartbeat((x) => x + 1);
                  }}
                  className="flex min-h-[3rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-xs font-bold text-foreground hover:bg-background disabled:opacity-60 transition-all active:scale-95 shadow-sm"
                >
                  Reset
                </button>
              </div>
            </div>

            {kavlingError ? <div className="mt-3 text-xs text-red-600">{kavlingError}</div> : null}
            {holdError ? <div className="mt-2 text-xs text-red-600">{holdError}</div> : null}
            {hold && !holdError ? (
              <div className="mt-2 text-xs text-muted">Kavling di-hold sementara sampai {formatTimeWIB(hold.expiresAt)} WIB.</div>
            ) : null}
            {holdSubmitting ? <div className="mt-2 text-xs text-muted">Mengunci kavling...</div> : null}

            <button
              type="button"
              onClick={() => setKavlingMapOpen(true)}
              className="mt-3 w-full overflow-hidden rounded-2xl border border-border bg-background text-left"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="text-xs font-medium text-foreground">Petunjuk Site Map (klik untuk zoom)</div>
                <div className="text-xs text-muted">PNG</div>
              </div>
              <div className="bg-surface p-3">
                <img
                  src={`/kavling/site-map.png?v=${siteMapVersion}`}
                  alt="Site Map Kavling"
                  className="h-56 w-full rounded-xl object-contain sm:h-72 md:h-96"
                  loading="lazy"
                />
              </div>
            </button>

            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border border-border bg-background" />
                <span className="text-[11px] text-muted">Tersedia</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted">Dipilih</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-red-500" />
                <span className="text-[11px] text-muted">Booked (Lunas)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-amber-400" />
                <span className="text-[11px] text-muted">Proses / Hold</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-gray-200 flex items-center justify-center">
                  <svg className="h-2 w-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-[11px] text-muted">Perbaikan (OOO)</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-8 gap-2 sm:grid-cols-12">
              {(() => {
                const pr = kavlingPrivateRange;
                const privateNeed = combinedAll ? privateQty : 0;
                const nonNeed = combinedAll ? mandiriQty + paketQty : 0;
                const privatePicked = combinedAll && pr ? kavlingSelected.filter((x) => x >= pr.start && x <= pr.end).length : 0;
                const nonPicked = combinedAll ? kavlingSelected.length - privatePicked : 0;

                const allNums =
                  effectiveKavlingScope === "private" && pr && typeof kavlingSellCount === "number"
                    ? Array.from({ length: kavlingSellCount }).map((_, i) => i + 1)
                    : kavlingAll;

                if (!allNums.length) {
                  return Array.from({ length: kavlingSellCount ?? 110 }).map((_, i) => (
                    <div key={i} className="h-9 rounded-xl border border-border bg-background" />
                  ));
                }

                return allNums.map((n) => {
                  const isPaid = kavlingPaid.includes(n);
                  const isHeld = kavlingHeld.includes(n);
                  const isOOO = kavlingOOO.includes(n);
                  const isTaken = kavlingTaken.includes(n);
                  const isSelected = kavlingSelected.includes(n);
                  const inPrivate = combinedAll && pr ? n >= pr.start && n <= pr.end : false;
                  const outOfScope = effectiveKavlingScope === "private" && pr ? n < pr.start || n > pr.end : false;
                  const quotaFull = combinedAll && pr ? (inPrivate ? privatePicked >= privateNeed : nonPicked >= nonNeed) : false;
                  const disabled = outOfScope || isTaken || (!isSelected && (kavlingSelected.length >= requiredKavlings || quotaFull));
                  
                  let cls = "bg-background text-foreground hover:bg-surface";
                  if (isSelected) cls = "bg-emerald-500 text-white border-emerald-600";
                  else if (isOOO) cls = "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed grayscale";
                  else if (isPaid) cls = "bg-red-500 text-white border-red-600 cursor-not-allowed";
                  else if (isHeld) cls = "bg-amber-400 text-white border-amber-500 cursor-not-allowed";
                  else if (isTaken) cls = "bg-muted/30 text-muted cursor-not-allowed";
                  else if (outOfScope) cls = "bg-muted/20 text-muted cursor-not-allowed";

                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={kavlingLoading || (disabled && !isSelected) || !requiredKavlings}
                      onClick={() => {
                        setKavlingSelected((prev) => {
                          const set = new Set(prev);
                          if (set.has(n)) set.delete(n);
                          else {
                            if (set.size >= requiredKavlings) return Array.from(set).sort((a, b) => a - b);
                            if (combinedAll && pr) {
                              const inPrivate = n >= pr.start && n <= pr.end;
                              const privatePicked = prev.filter((x) => x >= pr.start && x <= pr.end).length;
                              const nonPicked = prev.length - privatePicked;
                              if (inPrivate && privatePicked >= privateNeed) return Array.from(set).sort((a, b) => a - b);
                              if (!inPrivate && nonPicked >= nonNeed) return Array.from(set).sort((a, b) => a - b);
                            }
                            set.add(n);
                          }
                          return Array.from(set).sort((a, b) => a - b);
                        });
                      }}
                      className={`relative flex min-h-[2.5rem] items-center justify-center rounded-xl border border-border text-xs font-black ${cls} disabled:opacity-60 transition-all active:scale-95 overflow-hidden`}
                      aria-label={`Kavling ${n}${isTaken ? " terbooking" : ""}`}
                    >
                      {isOOO && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100/50">
                          <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      )}
                      <span className="relative z-10">{n}</span>
                    </button>
                  );
                });
              })()}
            </div>

            {requiredKavlings ? (
              <div className="mt-3 text-xs text-muted">
                Dipilih: {kavlingSelected.length}/{requiredKavlings}
                {kavlingSelected.length ? ` · ${kavlingSelected.join(", ")}` : ""}
              </div>
            ) : null}

            <Modal open={kavlingMapOpen} title="Site Map Kavling" onClose={() => setKavlingMapOpen(false)} maxWidthClassName="max-w-5xl">
              <div className="space-y-2">
                <div className="text-xs text-muted">Arahkan kursor ke gambar untuk zoom.</div>
                <div
                  className="w-full overflow-hidden rounded-xl border border-border bg-background"
                  onMouseEnter={() => setKavlingMapHover(true)}
                  onMouseLeave={() => setKavlingMapHover(false)}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setKavlingMapOrigin({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
                  }}
                >
                  <img
                    src={`/kavling/site-map.png?v=${siteMapVersion}`}
                    alt="Site Map Kavling"
                    className={`w-full select-none ${kavlingMapHover ? "cursor-zoom-in" : ""}`}
                    style={{
                      transformOrigin: `${kavlingMapOrigin.x}% ${kavlingMapOrigin.y}%`,
                      transform: kavlingMapHover ? "scale(2.5)" : "scale(1)",
                      transition: "transform 120ms ease-out",
                    }}
                    draggable={false}
                  />
                </div>
              </div>
            </Modal>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold text-foreground">Add-Ons (Opsional)</div>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-background text-left text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Harga</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {addOns.map((a) => (
                  <tr key={a.id} className="text-foreground">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">{formatIDR(a.price)}</td>
                    <td className="px-4 py-3">
                      <QuantityStepper
                        value={effectiveAddonQty[a.id] ?? 0}
                        min={0}
                        ariaLabel={`qty ${a.name}`}
                        onChange={(next) => {
                          const auto = autoAddonQty[a.id] ?? 0;
                          const manual = Math.max(0, next - auto);
                          setAddonQty((s) => ({ ...s, [a.id]: manual }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {addOns.length === 0 ? (
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

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-emerald-900">Booking berhasil dibuat</div>
                <div className="mt-1">Kode: {success.code}</div>
                <div>Total: {formatIDR(success.amount)}</div>
                {seedPaymentKind !== "paid" && paymentMethods.length ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-end">
                    <div className="space-y-1">
                      <div className="text-xs text-emerald-700">Metode pembayaran</div>
                      <select
                        value={paymentMethodCode}
                        onChange={(e) => setPaymentMethodCode(e.target.value)}
                        disabled={paying || settlementLinking}
                        className="h-9 w-full rounded-xl border border-emerald-200 bg-white px-3 text-sm text-emerald-900 outline-none focus:border-emerald-500 disabled:opacity-60"
                      >
                        {paymentMethods.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
                      <div className="text-xs text-emerald-700">Biaya layanan</div>
                      <div className="font-semibold text-emerald-900">{formatIDR(serviceFeePreview)}</div>
                      <div className="text-xs text-emerald-700">
                        Total dibayar: {formatIDR(baseAmountToPay + serviceFeePreview)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              {seedPaymentKind === "paid" ? (
                <div className="text-xs text-emerald-700">Pembayaran sudah lunas (manual) dan dicatat ke rekening perusahaan.</div>
              ) : seedPaymentKind === "dp_paid" ? (
                <div className="flex flex-col items-end gap-2">
                  <div className="text-xs text-emerald-700">DP sudah diterima (manual) dan dicatat ke rekening perusahaan.</div>
                  <button
                    type="button"
                    disabled={settlementLinking || baseAmountToPay <= 0}
                    onClick={createSettlementLink}
                    className="flex min-h-[3.25rem] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-emerald-600/10"
                  >
                    {settlementLinking ? "Membuat..." : "Buat Link Pelunasan (Xendit)"}
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={paying || baseAmountToPay <= 0}
                  onClick={payWithXendit}
                  className="flex min-h-[3.25rem] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-emerald-600/10"
                >
                  {paying
                    ? "Memproses..."
                    : dpPayload
                      ? "Bayar DP via Xendit"
                      : "Bayar via Xendit"}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-5">
          <div>
            <div className="text-xs text-muted">Estimasi total</div>
            <div className="text-lg font-semibold text-foreground">{formatIDR(estimatedAmount)}</div>
            <div className="text-xs text-muted">Final total dihitung server saat submit.</div>
          </div>
          <button
            type="submit"
            disabled={submitting || loading}
            className="flex min-h-[4rem] items-center justify-center rounded-xl bg-primary px-8 py-4 text-[15px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-95 shadow-xl shadow-primary/10"
          >
            {submitting ? "Memproses..." : "Buat Booking"}
          </button>
        </div>
      </form>
    </div>
  );
}
