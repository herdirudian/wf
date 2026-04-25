"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";

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

type PublicPaymentMethod = { code: string; label: string; feeFlat: number; feeBps: number };

function readDraft() {
  const raw = sessionStorage.getItem("wf_booking_draft");
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as BookingDraft;
    
    // Verify hold expiration if present
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

  useEffect(() => {
    const d = readDraft();
    setDraft(d);
    setLoading(false);
    if (!d) router.replace("/booking");
  }, [router]);

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
    return draft.kavlings.slice().sort((a, b) => a - b).join(", ");
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
    <div className="min-h-dvh bg-[#F8F9F6] relative overflow-hidden">
      {/* Nature-inspired background decorations */}
      <div className="absolute left-[-10%] top-[-5%] h-[40%] w-[40%] opacity-[0.03] pointer-events-none -rotate-12">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
        </svg>
      </div>
      <div className="absolute right-[-5%] bottom-[-5%] h-[30%] w-[30%] opacity-[0.02] pointer-events-none rotate-45">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="#2D3E10" d="M38.1,-65.4C50.2,-58.6,61.4,-49.2,69.1,-37.4C76.8,-25.6,81,-11.4,80.1,2.5C79.2,16.4,73.1,30.1,64.2,41.4C55.3,52.7,43.5,61.6,30.6,67.6C17.7,73.6,3.6,76.6,-10.1,74.9C-23.8,73.2,-37,66.8,-48.7,58.3C-60.4,49.8,-70.5,39.2,-75.9,26.6C-81.3,14,-82,1.3,-79.3,-12.3C-76.6,-25.9,-70.5,-40.4,-60.1,-48.6C-49.7,-56.8,-35.1,-58.8,-22.4,-65.3C-9.7,-71.8,1.1,-82.8,12.8,-82.6C24.5,-82.4,36,-71,38.1,-65.4Z" transform="translate(100 100)" />
        </svg>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12 relative z-10">
        {/* Progress Steps - Standardized with Booking Page */}
        <div className="mb-12">
          <div className="flex items-center justify-center gap-3">
            {[
              { id: 1, label: "Pilih", active: false, completed: true },
              { id: 2, label: "Konfirmasi", active: true, completed: false },
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
                    {step.active && (
                      <div className="absolute inset-0 animate-spin-slow opacity-20 pointer-events-none">
                        <svg viewBox="0 0 100 100" className="h-full w-full">
                          <path fill="currentColor" d="M50 5 L55 45 L95 50 L55 55 L50 95 L45 55 L5 50 L45 45 Z" />
                        </svg>
                      </div>
                    )}
                    {step.completed ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-black tracking-tight relative z-10">{step.id}</span>
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

        <div className="relative rounded-[2.5rem] border border-[#E8E8E1] bg-white p-10 shadow-2xl shadow-[#2D3E10]/5 overflow-hidden group/main">
          {/* Main Card Organic Decor */}
          <div className="absolute -right-20 -bottom-20 h-64 w-64 opacity-[0.03] pointer-events-none transition-transform duration-1000 group-hover/main:scale-110 group-hover/main:-rotate-12">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
            </svg>
          </div>
          <div className="flex items-center gap-5 mb-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1F3EE] text-[#2D3E10]">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#2D3E10]">Konfirmasi Pesanan</h1>
              <p className="text-sm font-medium text-[#2D3E10]/40 mt-0.5">Satu langkah lagi sebelum petualangan Anda dimulai</p>
            </div>
          </div>

          {draft.hold?.expiresAt && holdLeftLabel ? (
            <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/10 bg-[#F1F3EE]/50 p-8 shadow-xl shadow-primary/5 backdrop-blur-sm group">
                {/* Organic decorative background element */}
                <div className="absolute -right-12 -top-12 h-48 w-48 opacity-[0.03] transition-transform duration-1000 group-hover:scale-125 group-hover:rotate-12">
                  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
                  </svg>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center justify-between gap-8 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-sm border border-primary/10">
                        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Selesaikan Pembayaran Segera</span>
                      </div>
                      <div className="text-xl font-black tracking-tight text-[#2D3E10]">
                        Kavling di-hold selama <span className="text-primary italic underline decoration-primary/20 underline-offset-8 decoration-4">{holdLeftLabel}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/booking?step=3")}
                    className="group w-full sm:w-auto flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10] shadow-sm transition-all hover:bg-[#2D3E10] hover:text-white hover:shadow-xl hover:shadow-[#2D3E10]/20 active:scale-95 border border-[#E8E8E1]"
                  >
                    <span>Pilih Ulang Kavling</span>
                    <svg className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
              <div className="flex items-center gap-2 ml-1">
                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Nama Lengkap</label>
              </div>
              <input
                value={draft.customer.name}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, name: e.target.value } } : s))}
                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                placeholder="Masukkan nama"
              />
            </div>
            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
              <div className="flex items-center gap-2 ml-1">
                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Nomor Telepon</label>
              </div>
              <input
                value={draft.customer.phone}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, phone: e.target.value } } : s))}
                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                placeholder="0812..."
              />
            </div>
            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
              <div className="flex items-center gap-2 ml-1">
                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                </svg>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Alamat Email</label>
              </div>
              <input
                type="email"
                value={draft.customer.email}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, email: e.target.value } } : s))}
                className="mt-2 w-full bg-transparent text-base font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20"
                placeholder="nama@email.com"
              />
            </div>
            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-6 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
              <div className="flex items-center gap-2 ml-1">
                <svg className="h-3 w-3 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/40">Durasi Menginap</label>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="text-base font-bold text-[#2D3E10]">{draft.checkIn}</div>
                <svg className="h-4 w-4 text-primary/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <div className="text-base font-bold text-[#2D3E10]">{draft.checkOut}</div>
              </div>
              <div className="mt-1 text-[10px] font-black text-primary/40 uppercase tracking-widest">Total Tamu: {draft.totalGuest} Orang</div>
            </div>
          </div>

          <div className="mt-10 space-y-5">
            <div className="flex items-center gap-2 ml-1">
              <svg className="h-4 w-4 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2D3E10]/40">Rincian Unit & Kavling</h3>
            </div>
            
            <div className="overflow-hidden rounded-3xl border border-[#E8E8E1] bg-white shadow-sm transition-all hover:shadow-md">
              <div className="p-8 space-y-6">
                {draft.display.items.map((it) => (
                  <div key={it.unitId} className="flex items-center justify-between group/item">
                    <div className="flex items-center gap-5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F3EE] text-primary transition-all duration-500 group-hover/item:bg-primary group-hover/item:text-white group-hover/item:rotate-6">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-sm font-black text-[#2D3E10] block tracking-tight">{it.name}</span>
                        <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Unit Reservasi</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Qty</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3EE] text-xs font-black text-[#2D3E10]">{it.quantity}</span>
                    </div>
                  </div>
                ))}
                {draft.display.items.length === 0 && <div className="text-sm text-[#2D3E10]/40 italic py-2">Tidak ada unit terpilih</div>}
              </div>
              
              <div className="border-t border-[#E8E8E1] bg-[#F1F3EE]/40 p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm group-hover:scale-110 transition-transform duration-500">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Kavling Terpilih</div>
                      <div className="mt-1 text-base font-black text-[#2D3E10] tracking-tight">{kavlingText}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Tipe Scope</div>
                    <div className="mt-1 inline-flex items-center rounded-lg bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                      {draft.kavlingScope || "Mandiri"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {draft.display.addOns.length > 0 && (
            <div className="mt-12 space-y-5">
              <div className="flex items-center gap-2 ml-1">
                <svg className="h-4 w-4 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2D3E10]/40">Layanan Tambahan</h3>
              </div>
              <div className="rounded-3xl border border-[#E8E8E1] bg-white p-8 space-y-6 shadow-sm transition-all hover:shadow-md">
                {draft.display.addOns.map((a) => (
                  <div key={a.addOnId} className="flex items-center justify-between group/addon">
                    <div className="flex items-center gap-5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F3EE] text-primary transition-all duration-500 group-hover/addon:bg-primary group-hover/addon:text-white group-hover/addon:-rotate-6">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
                        </svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-[#2D3E10] tracking-tight">{a.name}</span>
                        <span className="text-[10px] font-black text-[#2D3E10]/40 uppercase tracking-widest">{formatIDR(a.price)} / unit</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Qty</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3EE] text-xs font-black text-[#2D3E10]">{a.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-12 space-y-5">
            <div className="flex items-center gap-2 ml-1">
              <svg className="h-4 w-4 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2D3E10]/40">Permintaan Khusus</h3>
            </div>
            <div className="group rounded-3xl border border-[#E8E8E1] bg-white p-8 transition-all focus-within:border-primary/20 focus-within:shadow-xl focus-within:shadow-primary/5">
              <textarea
                value={draft.specialRequest ?? ""}
                onChange={(e) => setDraft((s) => (s ? { ...s, specialRequest: e.target.value } : s))}
                className="w-full min-h-[120px] bg-transparent text-sm font-bold text-[#2D3E10] outline-none placeholder:text-[#2D3E10]/20 resize-none leading-relaxed"
                placeholder="Contoh: lokasi dekat toilet, bawa anak kecil, request check-in lebih awal..."
              />
            </div>
          </div>

          <div className="mt-12 space-y-5">
            <div className="flex items-center gap-2 ml-1">
              <svg className="h-4 w-4 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2D3E10]/40">Metode Pembayaran</h3>
            </div>
            <div className="relative rounded-3xl border border-[#E8E8E1] bg-white p-8 shadow-sm transition-all hover:shadow-md overflow-hidden group/payment">
              {/* Organic decor for payment section */}
              <div className="absolute -left-10 -bottom-10 h-32 w-32 opacity-[0.03] pointer-events-none transition-transform duration-1000 group-hover/payment:scale-125 group-hover/payment:rotate-12">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#2D3E10" d="M38.1,-65.4C50.2,-58.6,61.4,-49.2,69.1,-37.4C76.8,-25.6,81,-11.4,80.1,2.5C79.2,16.4,73.1,30.1,64.2,41.4C55.3,52.7,43.5,61.6,30.6,67.6C17.7,73.6,3.6,76.6,-10.1,74.9C-23.8,73.2,-37,66.8,-48.7,58.3C-60.4,49.8,-70.5,39.2,-75.9,26.6C-81.3,14,-82,1.3,-79.3,-12.3C-76.6,-25.9,-70.5,-40.4,-60.1,-48.6C-49.7,-56.8,-35.1,-58.8,-22.4,-65.3C-9.7,-71.8,1.1,-82.8,12.8,-82.6C24.5,-82.4,36,-71,38.1,-65.4Z" transform="translate(100 100)" />
                </svg>
              </div>

              <div className="relative z-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40 ml-1">Pilih Metode</label>
                  <div className="relative group">
                    <select
                      value={paymentMethodCode}
                      onChange={(e) => setPaymentMethodCode(e.target.value)}
                      disabled={submitting || !paymentMethods.length}
                      className="h-14 w-full appearance-none rounded-2xl border border-[#E8E8E1] bg-white px-5 pr-12 text-sm font-black text-[#2D3E10] outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 disabled:opacity-50"
                    >
                      {paymentMethods.length ? null : <option value="">Tidak ada metode</option>}
                      {paymentMethods.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-primary/30 transition-transform group-focus-within:rotate-180">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#F1F3EE] p-7 space-y-4 relative overflow-hidden group/fee">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover/fee:bg-white/60 transition-colors" />
                  <div className="relative z-10">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Biaya Layanan</span>
                      <span className="text-sm font-black text-[#2D3E10]">{formatIDR(serviceFeePreview)}</span>
                    </div>
                    <div className="h-px bg-[#2D3E10]/5 my-4" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Total Pembayaran</span>
                      <span className="text-xl font-black text-primary tracking-tight">
                        {formatIDR(Math.max(0, Math.round(Number(draft.amountEstimate) || 0)) + serviceFeePreview)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-10 border-t border-[#E8E8E1]">
            <label className="flex cursor-pointer items-start gap-4 group">
              <div className="relative flex h-6 w-6 shrink-0 items-center justify-center mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="peer h-full w-full cursor-pointer appearance-none rounded-[0.7rem] border-2 border-[#E8E8E1] bg-white transition-all duration-500 checked:border-primary checked:bg-primary hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
                />
                <svg
                  className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-all duration-500 scale-50 peer-checked:opacity-100 peer-checked:scale-110"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs font-medium leading-relaxed text-[#2D3E10]/60 transition-colors duration-500 group-hover:text-[#2D3E10]">
                Dengan melanjutkan ke pembayaran, Anda dianggap telah membaca dan menyetujui{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                  className="font-bold text-[#2D3E10] hover:text-primary transition-colors underline decoration-dotted underline-offset-4 decoration-primary/30 hover:decoration-primary"
                >
                  Syarat & Ketentuan
                </button>,{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                  className="font-bold text-[#2D3E10] hover:text-primary transition-colors underline decoration-dotted underline-offset-4 decoration-primary/30 hover:decoration-primary"
                >
                  Kebijakan Privasi
                </button>, serta{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowCancellationModal(true); }}
                  className="font-bold text-[#2D3E10] hover:text-primary transition-colors underline decoration-dotted underline-offset-4 decoration-primary/30 hover:decoration-primary"
                >
                  Kebijakan Pembatalan
                </button> yang berlaku di{" "}
                <span className="font-bold text-[#2D3E10] italic">Woodforest Jayagiri 48</span>.
              </span>
            </label>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => router.back()}
                className="group order-2 flex h-16 flex-1 items-center justify-center rounded-[1.5rem] border border-[#E8E8E1] bg-white px-8 text-[11px] font-black uppercase tracking-[0.3em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] hover:border-primary/30 active:scale-95 sm:order-1"
              >
                <svg className="mr-3 h-4 w-4 text-primary transition-transform duration-500 group-hover:-translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Kembali
              </button>
              <button
                type="button"
                disabled={submitting || !agreed}
                onClick={() => confirmAndPay()}
                className="group relative order-1 flex h-16 flex-[2] items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#2D3E10] px-8 text-[11px] font-black uppercase tracking-[0.3em] text-white shadow-2xl shadow-[#2D3E10]/20 transition-all hover:bg-[#1A2508] hover:-translate-y-1 active:scale-95 disabled:opacity-30 disabled:shadow-none sm:order-2"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <span className="relative z-10">{submitting ? "Memproses..." : "Konfirmasi & Bayar Sekarang"}</span>
                <svg className="relative z-10 ml-3 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="relative overflow-hidden rounded-[2.5rem] border border-red-100 bg-red-50/30 p-7 shadow-xl shadow-red-900/5 backdrop-blur-sm">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-red-100/20 blur-3xl" />
                <div className="flex flex-col gap-6 relative z-10">
                  <div className="flex items-center gap-6">
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
                  <button
                    type="button"
                    onClick={() => router.push("/booking")}
                    className="group flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-red-600 hover:text-red-700 transition-all ml-1"
                  >
                    <svg className="h-4 w-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Kembali ke Halaman Booking</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Nature-Inspired Footer */}
      <footer className="mt-20 border-t border-[#E8E8E1] bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl rounded-[2.5rem] bg-[#F1F3EE] p-12 text-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
              
              <div className="relative z-10 space-y-6">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary shadow-sm mb-2">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                </div>
                <h4 className="text-xl font-black text-[#2D3E10]">Butuh bantuan reservasi?</h4>
                <p className="text-sm font-medium text-[#2D3E10]/60 leading-relaxed max-w-md mx-auto">Tim reservasi kami siap membantu Anda merencanakan liburan impian yang tak terlupakan di Woodforest Jayagiri 48.</p>
                <a 
                  href="https://wa.me/6281234567890" 
                  target="_blank" 
                  className="group relative mx-auto flex h-16 w-full max-w-xs items-center justify-center overflow-hidden rounded-[1.2rem] bg-[#2D3E10] px-8 text-[11px] font-bold uppercase tracking-[0.2em] text-white shadow-xl shadow-[#2D3E10]/10 transition-all hover:bg-[#3D5216] hover:-translate-y-1 active:scale-[0.98]"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  <span className="relative z-10">Hubungi via WhatsApp</span>
                  <svg className="relative z-10 ml-3 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-16 border-t border-[#E8E8E1] pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/30">
                &copy; 2026 Woodforest Jayagiri 48.
              </p>
            </div>
            <div className="flex items-center gap-8">
              <button onClick={() => setShowPrivacyModal(true)} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/30 hover:text-primary transition-colors">Privacy Policy</button>
              <button onClick={() => setShowCancellationModal(true)} className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D3E10]/30 hover:text-primary transition-colors">Terms of Service</button>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal Kebijakan Privasi & S&K */}
      <Modal 
        open={showPrivacyModal} 
        title="Kebijakan Privasi & Syarat Ketentuan" 
        onClose={() => setShowPrivacyModal(false)}
        maxWidthClassName="max-w-2xl"
      >
        <div className="relative overflow-hidden">
          {/* Organic decorative element */}
          <div className="absolute -right-24 -top-24 h-64 w-64 opacity-[0.03] pointer-events-none">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path fill="#2D3E10" d="M47.7,-63.2C59.9,-54.1,66.7,-37.2,70.1,-20.1C73.5,-3,73.5,14.3,67.3,29.1C61.1,43.9,48.7,56.2,34.1,63.9C19.5,71.6,2.7,74.7,-14.1,71.4C-30.9,68.1,-47.7,58.4,-59.1,44.1C-70.5,29.8,-76.5,10.9,-73.8,-6.4C-71.1,-23.7,-59.7,-39.4,-45.5,-48.1C-31.3,-56.8,-14.3,-58.5,2.4,-61.8C19.1,-65.1,35.5,-72.3,47.7,-63.2Z" transform="translate(100 100)" />
            </svg>
          </div>

          <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="rounded-[2rem] bg-[#F1F3EE]/50 p-8 border border-primary/5 backdrop-blur-sm">
              <p className="text-sm font-medium leading-relaxed text-[#2D3E10]/80">
                Kami di <span className="font-black text-[#2D3E10]">Woodforest Jayagiri 48</span> berkomitmen untuk melindungi privasi dan keamanan data pribadi Anda. Kebijakan ini menjelaskan bagaimana kami mengelola informasi Anda.
              </p>
            </div>
            
            <div className="grid gap-6">
              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">1</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Pengumpulan Data</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Informasi yang kami kumpulkan meliputi nama, nomor telepon, dan alamat email yang Anda berikan secara sukarela untuk keperluan reservasi.</p>
              </section>

              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">2</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Penggunaan Informasi</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Data Anda digunakan semata-mata untuk memproses pesanan, mengirimkan konfirmasi pembayaran, dan memberikan layanan terbaik selama Anda menginap.</p>
              </section>

              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">3</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Keamanan & Kerahasiaan</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Kami tidak akan pernah menjual atau membagikan data pribadi Anda kepada pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan oleh peraturan hukum yang berlaku.</p>
              </section>

              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">4</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Ketentuan Layanan</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Tamu diwajibkan mematuhi peraturan yang berlaku di area Woodforest, menjaga ketenangan, serta melestarikan kebersihan dan kelestarian alam sekitar.</p>
              </section>
            </div>

            <div className="pt-4">
              <button 
                onClick={() => setShowPrivacyModal(false)}
                className="group relative w-full overflow-hidden rounded-[1.5rem] bg-[#2D3E10] py-5 text-[11px] font-black uppercase tracking-[0.3em] text-white shadow-2xl shadow-[#2D3E10]/20 transition-all hover:bg-[#1A2508] active:scale-95"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <span className="relative z-10">Saya Mengerti</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Kebijakan Pembatalan */}
      <Modal 
        open={showCancellationModal} 
        title="Kebijakan Pembatalan & Refund" 
        onClose={() => setShowCancellationModal(false)}
        maxWidthClassName="max-w-2xl"
      >
        <div className="relative overflow-hidden">
          {/* Organic decorative element */}
          <div className="absolute -left-24 -bottom-24 h-64 w-64 opacity-[0.03] pointer-events-none rotate-180">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path fill="#2D3E10" d="M47.7,-63.2C59.9,-54.1,66.7,-37.2,70.1,-20.1C73.5,-3,73.5,14.3,67.3,29.1C61.1,43.9,48.7,56.2,34.1,63.9C19.5,71.6,2.7,74.7,-14.1,71.4C-30.9,68.1,-47.7,58.4,-59.1,44.1C-70.5,29.8,-76.5,10.9,-73.8,-6.4C-71.1,-23.7,-59.7,-39.4,-45.5,-48.1C-31.3,-56.8,-14.3,-58.5,2.4,-61.8C19.1,-65.1,35.5,-72.3,47.7,-63.2Z" transform="translate(100 100)" />
            </svg>
          </div>

          <div className="relative z-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="group rounded-[2rem] bg-amber-50/50 p-8 border border-amber-100 backdrop-blur-sm transition-colors hover:bg-amber-50">
              <div className="flex items-start gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm border border-amber-100 transition-transform group-hover:rotate-12">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600/60">Perhatian Penting</p>
                  <p className="text-sm font-bold text-amber-900 leading-relaxed">Mengingat lokasi Woodforest Jayagiri 48 berada di kawasan hutan, operasional dapat ditutup sewaktu-waktu demi keselamatan jika terjadi cuaca ekstrem.</p>
                </div>
              </div>
            </div>
            
            <div className="grid gap-6">
              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">1</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Ketentuan Refund</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Down Payment (DP) yang telah dibayarkan bersifat <span className="font-black text-[#2D3E10] underline decoration-primary/20 underline-offset-4">non-refundable</span>, namun dapat digunakan untuk jadwal ulang (reschedule) sesuai ketentuan.</p>
              </section>

              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">2</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Force Majeure</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Dalam kondisi hujan ekstrem, badai angin, atau bencana alam yang membahayakan, manajemen berhak membatalkan reservasi demi keselamatan tamu.</p>
              </section>

              <section className="group relative space-y-3 pl-12">
                <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary text-[10px] font-black shadow-sm border border-primary/10 transition-transform group-hover:scale-110">3</div>
                <h4 className="text-[11px] font-black text-[#2D3E10] uppercase tracking-[0.2em]">Prosedur Reschedule</h4>
                <p className="text-sm font-medium leading-relaxed text-primary/60">Permintaan perubahan jadwal dapat diajukan maksimal 7 hari sebelum tanggal check-in, bergantung pada ketersediaan unit dan kavling.</p>
              </section>
            </div>

            <div className="pt-4">
              <button 
                onClick={() => setShowCancellationModal(false)}
                className="group relative w-full overflow-hidden rounded-[1.5rem] bg-[#2D3E10] py-5 text-[11px] font-black uppercase tracking-[0.3em] text-white shadow-2xl shadow-[#2D3E10]/20 transition-all hover:bg-[#1A2508] active:scale-95"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <span className="relative z-10">Saya Mengerti</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
