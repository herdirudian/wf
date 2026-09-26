"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { parseDateWIB } from "@/lib/time";
import { Modal } from "@/components/ui/Modal";

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
    items: Array<{
      unitId: string;
      name: string;
      quantity: number;
      includes?: string[];
      facilities?: string[];
    }>;
    addOns: Array<{ addOnId: string; name: string; price: number; quantity: number }>;
  };
  amountEstimate: number;
  createdAt: string;
};

function parseJsonArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
    }
    return [];
  } catch {
    return [];
  }
}

const FACILITY_LABEL_MAP: Record<string, string> = {
  wifi: "WiFi Kawasan",
  air_panas: "Water Heater Privat",
  kids_friendly: "Kids Friendly",
  breakfast: "Sarapan Pagi (Breakfast)",
  parkir: "Parkir Terjaga 24 Jam",
  listrik: "Akses Lot Listrik & Penerangan",
};

type PublicPaymentMethod = { code: string; label: string; feeFlat: number; feeBps: number };

type PaymentBrandLogo = { name: string; src: string; heightClass?: string };

type PaymentMethodMeta = {
  badge: string;
  description: string;
  primaryLogo?: string;
  icon?: React.ReactNode;
  brandLogos: PaymentBrandLogo[];
};

const INDONESIA_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const INDONESIA_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatStayDateDisplay(dateStr: string) {
  try {
    const d = parseDateWIB(dateStr);
    const day = INDONESIA_DAYS[d.getDay()];
    const date = d.getDate();
    const month = INDONESIA_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day}, ${date} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function getPaymentMethodMeta(code: string): PaymentMethodMeta {
  switch (code) {
    case "BANK_TRANSFER":
      return {
        badge: "Virtual Account",
        description: "BCA, Mandiri, BNI, BRI, Permata & ATM Bersama",
        icon: (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
        brandLogos: [
          { name: "Mandiri", src: "/logo-bank/Bank_Mandiri_logo_2016.svg.webp", heightClass: "h-3.5" },
          { name: "BRI", src: "/logo-bank/BRI.png", heightClass: "h-3.5" },
          { name: "BNI", src: "/logo-bank/BNI.webp", heightClass: "h-3.5" },
          { name: "BSI", src: "/logo-bank/BSI.webp", heightClass: "h-3.5" },
          { name: "Permata", src: "/logo-bank/Permata_Bank_(2024).svg.webp", heightClass: "h-3.5" },
          { name: "CIMB Niaga", src: "/logo-bank/CIMB-Niaga.png", heightClass: "h-2.5" },
          { name: "BJB", src: "/logo-bank/BJB.png", heightClass: "h-3.5" },
        ],
      };
    case "CREDIT_CARD":
      return {
        badge: "Kartu Kredit / Debit",
        description: "Visa, Mastercard, JCB (3D Secure)",
        primaryLogo: "/logo-bank/Visa-mastercard.jpg",
        brandLogos: [
          { name: "Visa & Mastercard", src: "/logo-bank/Visa-mastercard.jpg", heightClass: "h-4" },
        ],
      };
    case "EWALLET":
      return {
        badge: "E-Wallet",
        description: "ShopeePay, AstraPay, GoPay, OVO, DANA",
        primaryLogo: "/logo-bank/Shopee-pay.png",
        brandLogos: [
          { name: "ShopeePay", src: "/logo-bank/Shopee-pay.png", heightClass: "h-4" },
          { name: "AstraPay", src: "/logo-bank/astrapay.png", heightClass: "h-4" },
        ],
      };
    case "QRIS":
      return {
        badge: "QRIS Instan",
        description: "Scan instan lewat semua m-Banking & aplikasi e-wallet",
        primaryLogo: "/logo-bank/QRIS.png",
        brandLogos: [
          { name: "QRIS", src: "/logo-bank/QRIS.png", heightClass: "h-3.5" },
        ],
      };
    case "QR_CODE":
      return {
        badge: "QR Code",
        description: "Scan kode QR untuk verifikasi transaksi instan",
        primaryLogo: "/logo-bank/QRIS.png",
        brandLogos: [
          { name: "QRIS", src: "/logo-bank/QRIS.png", heightClass: "h-3.5" },
        ],
      };
    case "RETAIL_OUTLET":
      return {
        badge: "Gerai Retail",
        description: "Bayar di kasir Indomaret seluruh Indonesia",
        primaryLogo: "/logo-bank/indomaret.png",
        brandLogos: [
          { name: "Indomaret", src: "/logo-bank/indomaret.png", heightClass: "h-4.5" },
        ],
      };
    case "DIRECT_DEBIT":
      return {
        badge: "Direct Debit",
        description: "BCA OneKlik, BRI Direct Debit",
        icon: (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        ),
        brandLogos: [
          { name: "BRI", src: "/logo-bank/BRI.png", heightClass: "h-3.5" },
        ],
      };
    case "PAYLATER":
      return {
        badge: "Paylater",
        description: "Kredivo, Akulaku, Atome",
        icon: (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        brandLogos: [],
      };
    default:
      return {
        badge: "Pembayaran Online",
        description: "Verifikasi transaksi otomatis & instan",
        icon: (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
        brandLogos: [],
      };
  }
}

function readDraft() {
  const raw = sessionStorage.getItem("wf_booking_draft");
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as BookingDraft;
    if (d.hold?.expiresAt) {
      const expiresMs = new Date(d.hold.expiresAt).getTime();
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        delete d.hold;
      }
    }
    return d;
  } catch {
    return null;
  }
}

export default function BookingConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [paymentMethods, setPaymentMethods] = useState<PublicPaymentMethod[]>([]);
  const [paymentMethodCode, setPaymentMethodCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [unitDetailsMap, setUnitDetailsMap] = useState<Record<string, { includes: string[]; facilities: string[] }>>({});

  useEffect(() => {
    const d = readDraft();
    setDraft(d);
    setLoading(false);
    if (!d) router.replace("/booking");
  }, [router]);

  useEffect(() => {
    if (!draft?.checkIn || !draft?.checkOut) return;
    let cancelled = false;
    async function loadUnitDetails() {
      try {
        const res = await fetch(
          `/api/public/availability?checkIn=${encodeURIComponent(draft!.checkIn)}&checkOut=${encodeURIComponent(draft!.checkOut)}`
        );
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          units?: Array<{ id: string; includesJson?: string | null; facilitiesJson?: string | null }>;
        } | null;
        if (cancelled || !Array.isArray(data?.units)) return;
        const map: Record<string, { includes: string[]; facilities: string[] }> = {};
        for (const u of data.units) {
          if (u?.id) {
            map[u.id] = {
              includes: parseJsonArray(u.includesJson),
              facilities: parseJsonArray(u.facilitiesJson),
            };
          }
        }
        setUnitDetailsMap(map);
      } catch {
        // Fallback fetch error silently ignored
      }
    }
    void loadUnitDetails();
    return () => {
      cancelled = true;
    };
  }, [draft?.checkIn, draft?.checkOut]);

  useEffect(() => {
    let cancelled = false;
    async function loadMethods() {
      const res = await fetch("/api/public/payment-methods");
      const data = (await res.json().catch(() => null)) as { items?: PublicPaymentMethod[] } | null;
      if (cancelled) return;
      const items = Array.isArray(data?.items) ? data!.items.filter((x) => x && typeof (x as any).code === "string") : [];
      setPaymentMethods(items);
      if (!paymentMethodCode && items.length) setPaymentMethodCode(items[0].code);
    }
    void loadMethods();
    return () => {
      cancelled = true;
    };
  }, [paymentMethodCode]);

  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem("wf_booking_draft", JSON.stringify(draft));
    } catch {}
  }, [draft]);

  const holdLeftMs = useMemo(() => {
    if (!draft?.hold?.expiresAt) return null;
    const expiresMs = new Date(draft.hold.expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return null;
    return Math.max(0, expiresMs - nowMs);
  }, [draft?.hold?.expiresAt, nowMs]);

  const holdLeftLabel = useMemo(() => {
    if (holdLeftMs === null) return null;
    const totalSec = Math.floor(holdLeftMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [holdLeftMs]);

  useEffect(() => {
    if (!draft?.hold?.expiresAt) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [draft?.hold?.expiresAt]);

  useEffect(() => {
    if (!draft) return;
    if (!draft || submitting) return;
    if (!draft.kavlings.length) return;
    if (!draft.kavlingScope) return;
    const draft0 = draft;
    let cancelled = false;
    let inFlight = false;
    let failCount = 0;
    let t: number | null = null;
    const ensureHold = async () => {
      const res = await fetch("/api/public/kavlings/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkIn: draft0.checkIn,
          checkOut: draft0.checkOut,
          scope: draft0.kavlingScope,
          numbers: draft0.kavlings,
          holdId: draft0.hold?.id,
          holdToken: draft0.hold?.token,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { holdId?: string; holdToken?: string; expiresAt?: string; message?: string }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal hold kavling");
      return data;
    };
    const tick = async () => {
      if (cancelled) return;
      if (cancelled || submitting) return;
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await ensureHold();
        if (!data?.holdId || !data?.holdToken || !data?.expiresAt) return;
        const holdId = data.holdId;
        const holdToken = data.holdToken;
        const expiresAt = data.expiresAt;
        setDraft((s) => {
          if (!s) return s;
          const same =
            s.hold?.id === holdId && s.hold?.token === holdToken && s.hold?.expiresAt === expiresAt;
          if (same) return s;
          return { ...s, hold: { id: holdId, token: holdToken, expiresAt } };
        });
        failCount = 0;
      } catch {
        failCount += 1;
        if (failCount >= 2) {
          cancelled = true;
          setError("Hold kavling sudah habis atau kavling sudah diambil. Silakan kembali ke halaman booking untuk pilih ulang kavling.");
          setDraft((s) => (s ? { ...s, hold: undefined } : s));
        }
        return;
      } finally {
        inFlight = false;
      }
    };
    function schedule() {
      if (cancelled) return;
      const expiresAt = draft0.hold?.expiresAt;
      const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
      const left = Number.isFinite(expiresMs) ? Math.max(0, expiresMs - Date.now()) : 0;
      const nextIn = left > 3 * 60_000 ? 60_000 : left > 90_000 ? 30_000 : left > 30_000 ? 15_000 : 8_000;
      t = window.setTimeout(async () => {
        await tick();
        schedule();
      }, nextIn);
    }

    void tick();
    schedule();

    function onVisibility() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    draft?.checkIn,
    draft?.checkOut,
    draft?.hold?.id,
    draft?.hold?.token,
    draft?.hold?.expiresAt,
    draft?.kavlingScope,
    draft?.kavlings,
  ]);

  const kavlingText = useMemo(() => {
    if (!draft?.kavlings?.length) return "-";
    return draft.kavlings.slice().sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })).join(", ");
  }, [draft?.kavlings]);

  const selectedPaymentMethod = useMemo(() => {
    if (!paymentMethodCode) return null;
    return paymentMethods.find((m) => m.code === paymentMethodCode) ?? null;
  }, [paymentMethodCode, paymentMethods]);

  const serviceFeePreview = useMemo(() => {
    if (!draft || !selectedPaymentMethod) return 0;
    const base = Math.max(0, Math.round(Number(draft.amountEstimate) || 0));
    const pctFee = Math.max(0, Math.round((base * Math.max(0, selectedPaymentMethod.feeBps || 0)) / 10_000));
    const flatFee = Math.max(0, Math.round(Number(selectedPaymentMethod.feeFlat) || 0));
    return pctFee + flatFee;
  }, [draft, selectedPaymentMethod]);

  const nightsCount = useMemo(() => {
    if (!draft?.checkIn || !draft?.checkOut) return 1;
    try {
      const inD = parseDateWIB(draft.checkIn);
      const outD = parseDateWIB(draft.checkOut);
      return Math.max(1, Math.round((outD.getTime() - inD.getTime()) / (24 * 60 * 60 * 1000)));
    } catch {
      return 1;
    }
  }, [draft?.checkIn, draft?.checkOut]);

  const guestSummary = useMemo(() => {
    if (!draft) return "";
    const details: string[] = [];
    if (draft.adultPax > 0) details.push(`${draft.adultPax} Dewasa`);
    if (draft.child5to10Pax > 0) details.push(`${draft.child5to10Pax} Anak (5-10 th)`);
    if (draft.childUnder5Pax > 0) details.push(`${draft.childUnder5Pax} Balita (<5 th)`);
    return details.join(" · ");
  }, [draft]);

  const grandTotal = useMemo(() => {
    if (!draft) return 0;
    return Math.max(0, Math.round(Number(draft.amountEstimate) || 0)) + serviceFeePreview;
  }, [draft, serviceFeePreview]);

  const accommodationSubtotal = useMemo(() => {
    if (!draft) return 0;
    const addOnsTotal = draft.display.addOns.reduce((acc, a) => acc + (a.price * a.quantity), 0);
    return Math.max(0, draft.amountEstimate - addOnsTotal);
  }, [draft]);

  const addOnsSubtotal = useMemo(() => {
    if (!draft) return 0;
    return draft.display.addOns.reduce((acc, a) => acc + (a.price * a.quantity), 0);
  }, [draft]);

  const unitInclusionsList = useMemo(() => {
    if (!draft) return [];
    return draft.display.items.map((item) => {
      const fromDraftIncludes = item.includes && item.includes.length > 0 ? item.includes : [];
      const fromDraftFacilities = item.facilities && item.facilities.length > 0 ? item.facilities : [];

      const fromFetched = unitDetailsMap[item.unitId];
      const includes = fromDraftIncludes.length > 0 ? fromDraftIncludes : (fromFetched?.includes ?? []);
      const facilitiesKeys = fromDraftFacilities.length > 0 ? fromDraftFacilities : (fromFetched?.facilities ?? []);

      const mappedFacilities = facilitiesKeys.map((k) => FACILITY_LABEL_MAP[k] || k);
      const combined = Array.from(new Set([...includes, ...mappedFacilities]));

      return {
        unitId: item.unitId,
        unitName: item.name,
        quantity: item.quantity,
        inclusions: combined,
      };
    });
  }, [draft, unitDetailsMap]);

  const aggregatedInclusions = useMemo(() => {
    const all: string[] = [];
    for (const item of unitInclusionsList) {
      for (const inc of item.inclusions) {
        if (!all.includes(inc)) {
          all.push(inc);
        }
      }
    }
    if (all.length === 0) {
      return [
        "Tiket resmi gerbang masuk kawasan Perhutani",
        "Parkir kendaraan terjaga 24 jam di area resort",
        "Akses fasilitas pemanas air (water heater) privat",
        "Akses lot listrik & penerangan malam hari",
      ];
    }
    return all;
  }, [unitInclusionsList]);

  async function confirmAndPay() {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    try {
      let payloadDraft = draft;
      if (!payloadDraft.customer.email.trim()) throw new Error("Email wajib diisi.");
      if (payloadDraft.kavlingScope && payloadDraft.kavlings.length) {
        const res = await fetch("/api/public/kavlings/hold", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            checkIn: payloadDraft.checkIn,
            checkOut: payloadDraft.checkOut,
            scope: payloadDraft.kavlingScope,
            numbers: payloadDraft.kavlings,
            holdId: payloadDraft.hold?.id,
            holdToken: payloadDraft.hold?.token,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { holdId?: string; holdToken?: string; expiresAt?: string; message?: string }
          | null;
        if (!res.ok) throw new Error(data?.message ?? "Gagal hold kavling");
        if (data?.holdId && data?.holdToken && data?.expiresAt) {
          payloadDraft = { ...payloadDraft, hold: { id: data.holdId, token: data.holdToken, expiresAt: data.expiresAt } };
          setDraft(payloadDraft);
        }
      }
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { ...payloadDraft.customer, email: payloadDraft.customer.email.trim() },
          specialRequest: payloadDraft.specialRequest ?? null,
          checkIn: payloadDraft.checkIn,
          checkOut: payloadDraft.checkOut,
          totalGuest: payloadDraft.totalGuest,
          adultPax: payloadDraft.adultPax,
          child5to10Pax: payloadDraft.child5to10Pax,
          childUnder5Pax: payloadDraft.childUnder5Pax,
          kavlings: payloadDraft.kavlings,
          hold: payloadDraft.hold,
          items: payloadDraft.items,
          addOns: payloadDraft.addOns,
        }),
      });
      const data = (await res.json().catch(() => null)) as { code?: string; amount?: number; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal membuat booking");
      if (!data?.code) throw new Error("Booking berhasil, tetapi kode tidak ada");

      if (payloadDraft.hold?.id && payloadDraft.hold?.token) {
        await fetch("/api/public/kavlings/hold/release", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ holdId: payloadDraft.hold.id, holdToken: payloadDraft.hold.token }),
          keepalive: true,
        }).catch(() => null);
      }

      const payUrl = new URL(`/api/public/bookings/${encodeURIComponent(data.code)}/pay`, window.location.origin);
      payUrl.searchParams.set("mode", "balance");
      if (paymentMethodCode) payUrl.searchParams.set("pm", paymentMethodCode);
      const payRes = await fetch(payUrl.toString(), { 
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payData = (await payRes.json().catch(() => null)) as { invoiceUrl?: string | null; message?: string } | null;
      if (!payRes.ok) throw new Error(payData?.message ?? "Gagal membuat link pembayaran");
      if (!payData?.invoiceUrl) throw new Error("Link pembayaran tidak tersedia");

      sessionStorage.removeItem("wf_booking_draft");
      window.location.href = payData.invoiceUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal checkout");
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (!draft) return null;

  return (
    <div className="min-h-dvh bg-[#FDFDFB] text-[#2D3E10] antialiased pb-36 lg:pb-16 relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
          
          {/* Top Brand Marker & Trust Beacon */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E8E1] pb-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#2D3E10]/70">
              <span className="flex h-2 w-2 rounded-full bg-primary" />
              <span>Woodforest Jayagiri 48</span>
              <span className="text-[#E8E8E1]">·</span>
              <span>1.620 mdpl Lembang</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2D3E10]/70">
              <svg className="h-4 w-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Reservasi Resmi & Terproteksi</span>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-[#2D3E10]">
              Konfirmasi Reservasi
            </h1>
            <p className="mt-2 text-xs sm:text-sm font-medium text-[#2D3E10]/70 max-w-xl leading-relaxed">
              Tinjau rincian menginap, lokasi kavling, dan opsi pembayaran sebelum dialihkan ke gerbang pembayaran aman.
            </p>
          </div>

          {/* Hold Countdown Banner */}
          {draft.hold?.expiresAt && holdLeftLabel ? (
            <div className="mb-8 overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-200/80 bg-amber-50/50 p-5 sm:p-6 backdrop-blur-sm shadow-xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100/90 text-amber-900 border border-amber-200/80">
                    <svg className="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900/80">Kavling Diamankan</span>
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    </div>
                    <p className="text-base sm:text-lg font-black text-[#2D3E10] tracking-tight">
                      Sisa Waktu Hold: <span className="font-mono tabular-nums text-amber-900">{holdLeftLabel}</span>
                    </p>
                    <p className="text-xs text-[#2D3E10]/60 hidden sm:block">
                      Kavling Anda dikunci sementara agar tidak dapat dipesan oleh tamu lain.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/booking")}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-amber-300 bg-white text-[11px] font-black uppercase tracking-wider text-[#2D3E10] transition-all hover:bg-[#2D3E10] hover:text-white hover:border-[#2D3E10] active:scale-95 shadow-2xs"
                >
                  Ubah Pilihan
                </button>
              </div>
            </div>
          ) : null}

          {/* Main 2-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Details & Payment Methods (7 Columns) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Card 1: Data Kontak Pemesan */}
              <div className="rounded-2xl sm:rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3 border-b border-[#E8E8E1]/80 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2D3E10]/5 text-[#2D3E10]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-[#2D3E10]">Data Kontak Pemesan</h2>
                    <p className="text-xs text-[#2D3E10]/60">Informasi utama untuk konfirmasi e-tiket & invoice</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#E8E8E1]/60 bg-[#FAFBF7]/50 p-3.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Nama Lengkap</span>
                    <p className="mt-1 text-sm sm:text-base font-bold text-[#2D3E10]">{draft.customer.name}</p>
                  </div>

                  <div className="rounded-xl border border-[#E8E8E1]/60 bg-[#FAFBF7]/50 p-3.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Nomor WhatsApp</span>
                    <p className="mt-1 text-sm sm:text-base font-bold text-[#2D3E10] font-mono tabular-nums">{draft.customer.phone}</p>
                  </div>

                  <div className="rounded-xl border border-[#E8E8E1]/60 bg-[#FAFBF7]/50 p-3.5 sm:col-span-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Alamat Email</span>
                    <p className="mt-1 text-sm sm:text-base font-bold text-[#2D3E10] break-all">{draft.customer.email}</p>
                  </div>

                  {draft.specialRequest && (
                    <div className="rounded-xl border border-[#E8E8E1]/60 bg-[#FAFBF7]/50 p-3.5 sm:col-span-2">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Catatan / Permintaan Khusus</span>
                      <p className="mt-1 text-xs sm:text-sm font-medium text-[#2D3E10]/80 italic">"{draft.specialRequest}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Jadwal & Lokasi Kavling */}
              <div className="rounded-2xl sm:rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3 border-b border-[#E8E8E1]/80 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2D3E10]/5 text-[#2D3E10]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-[#2D3E10]">Jadwal Menginap & Kavling</h2>
                    <p className="text-xs text-[#2D3E10]/60">Durasi kedatangan dan spot kavling terpilih</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Dates Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[#E8E8E1] bg-[#FAFBF7]/60 p-4">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Check-in</span>
                      <p className="mt-1 text-sm sm:text-base font-black text-[#2D3E10] tracking-tight">{formatStayDateDisplay(draft.checkIn)}</p>
                      <p className="text-[11px] text-[#2D3E10]/50 mt-0.5">Mulai pukul 14:00 WIB</p>
                    </div>

                    <div className="rounded-xl border border-[#E8E8E1] bg-[#FAFBF7]/60 p-4">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Check-out</span>
                      <p className="mt-1 text-sm sm:text-base font-black text-[#2D3E10] tracking-tight">{formatStayDateDisplay(draft.checkOut)}</p>
                      <p className="text-[11px] text-[#2D3E10]/50 mt-0.5">Maksimal pukul 12:00 WIB</p>
                    </div>
                  </div>

                  {/* Summary Bar: Duration, Guests, Kavling */}
                  <div className="rounded-xl border border-[#E8E8E1]/80 bg-white p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#2D3E10]/70 uppercase tracking-wider text-[11px]">Durasi Menginap</span>
                      <span className="font-bold text-[#2D3E10] bg-[#2D3E10]/5 px-2.5 py-1 rounded-md">{nightsCount} Malam</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-t border-[#E8E8E1]/60 pt-3">
                      <span className="font-semibold text-[#2D3E10]/70 uppercase tracking-wider text-[11px]">Jumlah Tamu</span>
                      <div className="text-right">
                        <span className="font-bold text-[#2D3E10]">{draft.totalGuest} Tamu</span>
                        {guestSummary && (
                          <span className="block text-[11px] text-[#2D3E10]/60">{guestSummary}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-t border-[#E8E8E1]/60 pt-3">
                      <span className="font-semibold text-[#2D3E10]/70 uppercase tracking-wider text-[11px]">Nomor Kavling</span>
                      <span className="font-black text-primary font-mono text-sm tracking-tight">{kavlingText}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Akomodasi & Layanan Tambahan */}
              <div className="rounded-2xl sm:rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3 border-b border-[#E8E8E1]/80 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2D3E10]/5 text-[#2D3E10]">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-[#2D3E10]">Akomodasi & Fasilitas Ekstra</h2>
                    <p className="text-xs text-[#2D3E10]/60">Unit tenda atau cabin kayu serta layanan opsional</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Units */}
                  <div className="space-y-2.5">
                    {draft.display.items.map((it) => {
                      const uIncs = unitInclusionsList.find((u) => u.unitId === it.unitId)?.inclusions ?? [];
                      return (
                        <div key={it.unitId} className="flex flex-col rounded-xl bg-[#FAFBF7]/60 p-3.5 border border-[#E8E8E1]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-lg bg-[#2D3E10]/5 flex items-center justify-center text-primary shrink-0">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-bold text-[#2D3E10] truncate">{it.name}</p>
                                <p className="text-[10px] font-semibold text-[#2D3E10]/50 uppercase tracking-wider">Unit Utama</p>
                              </div>
                            </div>
                            <span className="flex h-7 px-2.5 items-center justify-center rounded-md bg-white border border-[#E8E8E1] text-xs font-black text-[#2D3E10]">
                              {it.quantity} Unit
                            </span>
                          </div>

                          {/* Inclusions badges if present */}
                          {uIncs.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-[#E8E8E1]/60">
                              {uIncs.map((inc, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-[#2D3E10]/80 border border-[#E8E8E1]"
                                >
                                  <span className="text-emerald-600 font-bold text-[9px]">✓</span>
                                  <span>{inc}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add-ons */}
                  {draft.display.addOns.length > 0 && (
                    <div className="rounded-xl border border-[#E8E8E1] bg-white p-4 space-y-3">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Layanan Ekstra</span>
                      <div className="divide-y divide-[#E8E8E1]/60">
                        {draft.display.addOns.map((a) => (
                          <div key={a.addOnId} className="flex justify-between items-center py-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#2D3E10]">{a.name}</span>
                              <span className="text-[10px] text-[#2D3E10]/60">× {a.quantity}</span>
                            </div>
                            <span className="font-bold text-[#2D3E10] font-mono tabular-nums">{formatIDR(a.price * a.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Metode Pembayaran (With Authentic Logos) */}
              <div className="rounded-2xl sm:rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E8E8E1]/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2D3E10]/5 text-[#2D3E10]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-black tracking-tight text-[#2D3E10]">Pilih Metode Pembayaran</h2>
                      <p className="text-xs text-[#2D3E10]/60">Transaksi terverifikasi instan tanpa konfirmasi manual</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-semibold text-[#2D3E10]/60 bg-[#FAFBF7] px-2.5 py-1 rounded-lg border border-[#E8E8E1]">
                    <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Enkripsi 256-Bit</span>
                  </div>
                </div>

                {/* Method Radio List */}
                <div className="space-y-3" role="radiogroup" aria-label="Pilihan metode pembayaran">
                  {paymentMethods.length === 0 ? (
                    <div className="space-y-2.5 animate-pulse py-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 rounded-2xl bg-[#F1F3EE]/60 border border-[#E8E8E1]/60" />
                      ))}
                    </div>
                  ) : (
                    paymentMethods.map((m) => {
                      const isSelected = paymentMethodCode === m.code;
                      const meta = getPaymentMethodMeta(m.code);
                      const baseAmount = Math.max(0, Math.round(Number(draft?.amountEstimate) || 0));
                      const feePct = Math.round((baseAmount * Math.max(0, m.feeBps || 0)) / 10_000);
                      const totalFee = feePct + Math.max(0, Math.round(Number(m.feeFlat) || 0));

                      return (
                        <div
                          key={m.code}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => {
                            if (!submitting) setPaymentMethodCode(m.code);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (!submitting) setPaymentMethodCode(m.code);
                            }
                          }}
                          className={`group relative flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D3E10] ${
                            isSelected
                              ? "border-[#2D3E10] bg-[#FAFBF7] shadow-sm shadow-[#2D3E10]/5 ring-1 ring-[#2D3E10]/20"
                              : "border-[#E8E8E1] bg-white hover:border-[#2D3E10]/40 hover:bg-[#FAFBF7]/40"
                          } ${submitting ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                            {meta.primaryLogo ? (
                              <div
                                className={`flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-2xl bg-white border p-1.5 transition-all duration-300 ${
                                  isSelected
                                    ? "border-[#2D3E10] shadow-sm ring-1 ring-[#2D3E10]/20"
                                    : "border-[#E8E8E1] group-hover:border-[#2D3E10]/40"
                                }`}
                              >
                                <img
                                  src={meta.primaryLogo}
                                  alt={m.label}
                                  className="h-7 w-auto max-w-full object-contain"
                                />
                              </div>
                            ) : (
                              <div
                                className={`flex h-12 w-12 sm:h-13 sm:w-13 shrink-0 items-center justify-center rounded-2xl transition-all duration-300 ${
                                  isSelected
                                    ? "bg-[#2D3E10] text-white shadow-sm"
                                    : "bg-[#F1F3EE] text-[#2D3E10]/70 group-hover:bg-[#2D3E10]/10 group-hover:text-[#2D3E10]"
                                }`}
                              >
                                {meta.icon}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-[#2D3E10] leading-snug">
                                  {m.label}
                                </span>
                                {isSelected && (
                                  <span className="inline-flex items-center rounded-md bg-[#2D3E10]/10 px-2 py-0.5 text-[10px] font-black text-[#2D3E10] uppercase tracking-wider">
                                    Dipilih
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#2D3E10]/60 line-clamp-1 mt-0.5">
                                {meta.description}
                              </p>

                              {/* Partner & Bank Logos */}
                              {meta.brandLogos.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                  {meta.brandLogos.map((b) => (
                                    <span
                                      key={b.name}
                                      title={b.name}
                                      className="inline-flex h-6 sm:h-7 items-center justify-center rounded-lg border border-[#E8E8E1] bg-white px-2 py-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all group-hover:border-[#2D3E10]/30"
                                    >
                                      <img
                                        src={b.src}
                                        alt={b.name}
                                        className={`${b.heightClass || "h-3.5"} w-auto max-w-[65px] object-contain`}
                                      />
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right hidden sm:block">
                              {totalFee > 0 ? (
                                <span className="text-[11px] font-bold text-[#2D3E10]/70 font-mono tabular-nums">
                                  + {formatIDR(totalFee)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  Bebas Biaya
                                </span>
                              )}
                            </div>

                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                                isSelected
                                  ? "border-[#2D3E10] bg-[#2D3E10]"
                                  : "border-[#D0D0C8] bg-white group-hover:border-[#2D3E10]/60"
                              }`}
                            >
                              {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Sticky Summary & Action (5 Columns) */}
            <div className="lg:col-span-5 lg:sticky lg:top-8 space-y-6">
              
              {/* Sticky Summary Card */}
              <div className="rounded-2xl sm:rounded-3xl border border-[#E8E8E1] bg-white p-6 shadow-sm sm:p-7">
                <div className="mb-5 border-b border-[#E8E8E1]/80 pb-4">
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-[#2D3E10]">Ringkasan Pembayaran</h2>
                  <p className="text-xs text-[#2D3E10]/60">Total biaya resmi tanpa pungutan tersembunyi</p>
                </div>

                {/* Breakdown Items */}
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#2D3E10]/70">Subtotal Akomodasi ({nightsCount} malam)</span>
                    <span className="font-bold text-[#2D3E10] font-mono tabular-nums">{formatIDR(accommodationSubtotal)}</span>
                  </div>

                  {addOnsSubtotal > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[#2D3E10]/70">Layanan Ekstra ({draft.display.addOns.length} item)</span>
                      <span className="font-bold text-[#2D3E10] font-mono tabular-nums">{formatIDR(addOnsSubtotal)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#2D3E10]/70">Biaya Layanan Pembayaran</span>
                    </div>
                    <span className="font-bold text-[#2D3E10] font-mono tabular-nums">
                      {serviceFeePreview > 0 ? formatIDR(serviceFeePreview) : "Bebas Biaya"}
                    </span>
                  </div>

                  <div className="h-px bg-[#E8E8E1] my-2" />

                  {/* Grand Total */}
                  <div className="flex justify-between items-baseline pt-1">
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-[#2D3E10]">Total Tagihan</span>
                      <p className="text-[10px] text-[#2D3E10]/50 mt-0.5">Termasuk pajak & fasilitas standar</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl sm:text-3xl font-black text-[#2D3E10] font-mono tabular-nums tracking-tight">
                        {formatIDR(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inclusive Inclusions Note */}
                <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2.5 text-[11px] text-[#2D3E10]/80">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <svg className="h-4 w-4 text-emerald-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Fasilitas Termasuk dalam Reservasi:</span>
                  </div>

                  {unitInclusionsList.length <= 1 ? (
                    <ul className="space-y-1.5 text-[#2D3E10]/80 pl-1">
                      {aggregatedInclusions.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                            ✓
                          </span>
                          <span className="leading-snug">{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-2.5 pt-1 divide-y divide-emerald-100/80">
                      {unitInclusionsList.map((u) => (
                        <div key={u.unitId} className="space-y-1.5 pt-2 first:pt-0">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            <span>{u.unitName} ({u.quantity} unit):</span>
                          </div>
                          <ul className="space-y-1 pl-3 text-[#2D3E10]/80">
                            {(u.inclusions.length > 0 ? u.inclusions : [
                              "Tiket resmi gerbang masuk kawasan Perhutani",
                              "Parkir kendaraan terjaga 24 jam di area resort",
                              "Akses lot listrik & penerangan malam hari",
                            ]).map((item, idx) => (
                              <li key={idx} className="flex items-start gap-1.5 text-[10px] leading-snug">
                                <span className="text-emerald-700 font-bold">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agreement Checkbox */}
                <div className="mt-6 pt-5 border-t border-[#E8E8E1]">
                  <label className="flex cursor-pointer items-start gap-3 group">
                    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="peer h-full w-full cursor-pointer appearance-none rounded-md border-2 border-[#E8E8E1] bg-white transition-all checked:border-primary checked:bg-primary hover:border-primary/40 focus:ring-2 focus:ring-primary/20"
                      />
                      <svg
                        className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-all scale-50 peer-checked:opacity-100 peer-checked:scale-100"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-medium leading-relaxed text-[#2D3E10]/70 select-none">
                      Saya menyetujui{" "}
                      <button type="button" onClick={() => setShowPrivacyModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/30 hover:text-primary">
                        Syarat & Ketentuan
                      </button>
                      ,{" "}
                      <button type="button" onClick={() => setShowPrivacyModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/30 hover:text-primary">
                        Kebijakan Privasi
                      </button>
                      , dan{" "}
                      <button type="button" onClick={() => setShowCancellationModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/30 hover:text-primary">
                        Kebijakan Pembatalan
                      </button>
                      .
                    </span>
                  </label>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 animate-in fade-in">
                    {error}
                  </div>
                )}

                {/* Desktop Action Buttons */}
                <div className="mt-6 hidden lg:flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={submitting || !agreed}
                    onClick={() => confirmAndPay()}
                    className="group relative flex min-h-[3.5rem] w-full items-center justify-center overflow-hidden rounded-xl bg-[#2D3E10] px-6 py-3.5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-[#2D3E10]/15 transition-all hover:bg-[#1A2508] active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <span className="relative z-10">{submitting ? "Memproses Invoice..." : "Konfirmasi & Bayar Sekarang"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => router.back()}
                    className="flex min-h-[3rem] w-full items-center justify-center rounded-xl border border-[#E8E8E1] bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[#2D3E10] transition-all hover:bg-[#FAFBF7] active:scale-[0.99]"
                  >
                    Kembali Ubah Data
                  </button>
                </div>

                {/* Trust Footer */}
                <div className="mt-6 pt-5 border-t border-[#E8E8E1]/60 flex items-center justify-center gap-3 text-[10px] text-[#2D3E10]/50 font-semibold text-center">
                  <span>Diproses Aman oleh Xendit</span>
                  <span>·</span>
                  <span>Notifikasi WhatsApp & Email</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Sticky Bottom Navigation for Mobile (< lg) */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-[#E8E8E1] bg-white/95 p-3 sm:p-4 backdrop-blur-xl lg:hidden shadow-[0_-10px_30px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2D3E10]/60">Total Bayar</span>
            <span className="text-base sm:text-lg font-black text-[#2D3E10] font-mono tabular-nums tracking-tight">
              {formatIDR(grandTotal)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => router.back()}
              className="px-3 py-2.5 rounded-xl border border-[#E8E8E1] bg-white text-[10px] font-black uppercase text-[#2D3E10]"
            >
              Kembali
            </button>
            <button
              type="button"
              disabled={submitting || !agreed}
              onClick={() => confirmAndPay()}
              className="px-5 py-2.5 rounded-xl bg-[#2D3E10] text-[10px] font-black uppercase tracking-wider text-white shadow-md active:scale-95 disabled:opacity-30 transition-all"
            >
              {submitting ? "Memproses..." : "Bayar Sekarang"}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={showPrivacyModal} title="Kebijakan Privasi & Syarat Ketentuan" onClose={() => setShowPrivacyModal(false)} maxWidthClassName="max-w-xl">
        <div className="space-y-6 py-4">
          <div className="rounded-2xl bg-[#FAFBF7] border border-[#E8E8E1] p-5 text-xs font-medium leading-relaxed text-[#2D3E10]/80">
            Kami menjaga kerahasiaan data reservasi Anda. Informasi kontak hanya digunakan untuk penerbitan invoice resmi, konfirmasi e-tiket, serta koordinasi resepsionis dan tim ranger Jayagiri.
          </div>
          <div className="space-y-4">
            {[
              { t: "Pengumpulan Data", d: "Kami mencatat nama pemesan, kontak WhatsApp, dan email untuk pengiriman tiket digital." },
              { t: "Penggunaan Data", d: "Informasi digunakan eksklusif untuk administrasi reservasi di Woodforest Jayagiri 48." },
              { t: "Keamanan Sistem", d: "Data Anda dienkripsi secara aman dan tidak diperjualbelikan kepada pihak manapun." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-black text-primary">{i+1}</span>
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3E10]">{item.t}</h3>
                  <p className="text-xs text-[#2D3E10]/70 leading-relaxed">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPrivacyModal(false)} className="w-full py-3.5 bg-[#2D3E10] text-white rounded-xl text-xs font-black uppercase tracking-widest mt-4 transition-all hover:bg-[#1A2508]">Tutup</button>
        </div>
      </Modal>

      <Modal open={showCancellationModal} title="Kebijakan Pembatalan & Reschedule" onClose={() => setShowCancellationModal(false)} maxWidthClassName="max-w-xl">
        <div className="space-y-6 py-4">
          <div className="rounded-2xl bg-amber-50 p-5 text-xs font-bold leading-relaxed text-amber-900 border border-amber-200/80">
            Pemberitahuan Cuaca & Alam: Keselamatan dan kenyamanan tamu di ketinggian 1.620 mdpl adalah prioritas utama kami.
          </div>
          <div className="space-y-4">
            {[
              { t: "Ketentuan Refund", d: "Pembayaran reservasi yang sudah terkonfirmasi tidak dapat di-refund (non-refundable)." },
              { t: "Penjadwalan Ulang (Reschedule)", d: "Permintaan reschedule dapat diajukan selambat-lambatnya 7 hari sebelum tanggal check-in (tergantung ketersediaan kavling)." },
              { t: "Kondisi Cuaca Ekstrem (Force Majeure)", d: "Jika terjadi cuaca ekstrem atau penutupan jalur oleh Perhutani, tamu berhak mendapatkan voucher reschedule gratis tanpa denda." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-[10px] font-black text-amber-800">{i+1}</span>
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#2D3E10]">{item.t}</h3>
                  <p className="text-xs text-[#2D3E10]/70 leading-relaxed">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowCancellationModal(false)} className="w-full py-3.5 bg-[#2D3E10] text-white rounded-xl text-xs font-black uppercase tracking-widest mt-4 transition-all hover:bg-[#1A2508]">Tutup</button>
        </div>
      </Modal>
    </div>
  );
}
