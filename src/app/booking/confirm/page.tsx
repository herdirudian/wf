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
  adultPax: number;
  child5to10Pax: number;
  childUnder5Pax: number;
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
    <div className="min-h-dvh bg-[#FDFDFB] relative overflow-hidden pb-48 sm:pb-24">
      {/* Subtle organic background elements */}
      <div className="absolute left-[-10%] top-[-5%] h-[50%] w-[50%] opacity-[0.02] pointer-events-none -rotate-12">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="#2D3E10" d="M44.7,-76.4C58.1,-69.2,69.2,-58.1,76.4,-44.7C83.7,-31.3,87,-15.7,85.6,-0.8C84.2,14.1,78.1,28.2,69.2,40.1C60.3,52,48.6,61.7,35.4,69.4C22.2,77.1,7.5,82.8,-7.4,82.8C-22.3,82.8,-37.4,77.1,-50.6,69.4C-63.8,61.7,-75.1,52,-82.1,40.1C-89.1,28.2,-91.8,14.1,-90.4,-0.8C-89,-15.7,-83.5,-31.3,-74.3,-44.7C-65.1,-58.1,-52.2,-69.2,-38.8,-76.4C-25.4,-83.6,-12.7,-86.8,0.7,-88C14.1,-89.2,28.2,-88.4,44.7,-76.4Z" transform="translate(100 100)" />
        </svg>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16 relative z-10">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 cubic-bezier(0.16, 1, 0.3, 1)">
          {/* Header Section */}
          <div className="mb-10 flex flex-col items-center text-center sm:items-start sm:text-left">
            <div className="inline-flex items-center rounded-full bg-primary/5 px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-4 border border-primary/10">
              Tahap Terakhir
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#2D3E10] sm:text-5xl">
              Konfirmasi <span className="italic text-primary">Pesanan</span>
            </h1>
            <p className="mt-4 text-sm font-medium text-[#2D3E10]/40 max-w-md leading-relaxed">
              Tinjau kembali rincian reservasi Anda sebelum melanjutkan ke proses pembayaran aman.
            </p>
          </div>

          {/* Hold Banner - More Refined */}
          {draft.hold?.expiresAt && holdLeftLabel ? (
            <div className="mb-8 overflow-hidden rounded-[2rem] border border-primary/10 bg-[#F1F3EE]/50 p-6 backdrop-blur-sm sm:p-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white text-primary shadow-sm border border-primary/5">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Sisa Waktu Hold</span>
                    <div className="text-xl font-black text-[#2D3E10]">
                      Berakhir dalam <span className="text-primary italic tabular-nums">{holdLeftLabel}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/booking?step=3")}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl border border-[#E8E8E1] bg-white text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10] transition-all hover:bg-[#2D3E10] hover:text-white active:scale-95"
                >
                  Pilih Ulang
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            {/* Customer Details Card */}
            <div className="group rounded-[2rem] border border-[#E8E8E1] bg-white p-6 transition-all duration-500 hover:border-primary/20 hover:shadow-xl hover:shadow-[#2D3E10]/5 sm:p-10">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F3EE] text-[#2D3E10] transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black tracking-tight text-[#2D3E10]">Detail Pemesan</h3>
              </div>

              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Nama Lengkap</label>
                  <p className="text-base font-bold text-[#2D3E10]">{draft.customer.name}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Nomor WhatsApp</label>
                  <p className="text-base font-bold text-[#2D3E10]">{draft.customer.phone}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Email</label>
                  <p className="text-base font-bold text-[#2D3E10]">{draft.customer.email}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Waktu Menginap</label>
                  <p className="text-base font-bold text-[#2D3E10]">{draft.checkIn} — {draft.checkOut}</p>
                  <p className="text-[10px] font-medium text-primary/40 italic">({draft.totalGuest} Tamu: {draft.adultPax}D, {draft.child5to10Pax}A, {draft.childUnder5Pax}B)</p>
                </div>
              </div>
            </div>

            {/* Reservation Summary Card */}
            <div className="group rounded-[2rem] border border-[#E8E8E1] bg-white p-6 transition-all duration-500 hover:border-primary/20 hover:shadow-xl hover:shadow-[#2D3E10]/5 sm:p-10">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F3EE] text-[#2D3E10] transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg font-black tracking-tight text-[#2D3E10]">Rincian Reservasi</h3>
              </div>

              <div className="space-y-6">
                {/* Units */}
                <div className="space-y-4">
                  {draft.display.items.map((it) => (
                    <div key={it.unitId} className="flex items-center justify-between rounded-2xl bg-[#FDFDFB] p-4 border border-[#E8E8E1]/50">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-[#F1F3EE] flex items-center justify-center text-primary">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#2D3E10]">{it.name}</p>
                          <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Unit Reservasi</p>
                        </div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3EE] text-[11px] font-black text-[#2D3E10]">
                        {it.quantity}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Kavlings & Addons */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#E8E8E1]/50 bg-[#FDFDFB] p-5">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Nomor Kavling</span>
                    <p className="mt-1 text-base font-black text-[#2D3E10] tracking-tight">{kavlingText}</p>
                  </div>
                  <div className="rounded-2xl border border-[#E8E8E1]/50 bg-[#FDFDFB] p-5">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Layanan Tambahan</span>
                    <p className="mt-1 text-sm font-bold text-[#2D3E10]">
                      {draft.display.addOns.length > 0 
                        ? `${draft.display.addOns.length} Layanan Terpilih`
                        : "Tidak ada add-ons"}
                    </p>
                  </div>
                </div>

                {draft.specialRequest && (
                  <div className="rounded-2xl border border-[#E8E8E1]/50 bg-[#FDFDFB] p-5">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#2D3E10]/30">Permintaan Khusus</span>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#2D3E10]/70 italic">"{draft.specialRequest}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method Card */}
            <div className="group rounded-[2rem] border border-[#E8E8E1] bg-white p-6 transition-all duration-500 hover:border-primary/20 hover:shadow-xl hover:shadow-[#2D3E10]/5 sm:p-10">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F3EE] text-[#2D3E10] transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black tracking-tight text-[#2D3E10]">Metode Pembayaran</h3>
              </div>

              <div className="space-y-8">
                <div className="relative">
                  <select
                    value={paymentMethodCode}
                    onChange={(e) => setPaymentMethodCode(e.target.value)}
                    disabled={submitting || !paymentMethods.length}
                    className="h-14 w-full appearance-none rounded-2xl border border-[#E8E8E1] bg-[#FDFDFB] px-6 text-sm font-black text-[#2D3E10] outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/5 disabled:opacity-50"
                  >
                    {paymentMethods.length ? null : <option value="">Memuat metode...</option>}
                    {paymentMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-primary/30">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <div className="rounded-3xl bg-[#F1F3EE] p-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Subtotal</span>
                      <span className="text-sm font-bold text-[#2D3E10]">{formatIDR(draft.amountEstimate)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/40">Biaya Layanan</span>
                      <span className="text-sm font-bold text-[#2D3E10]">{formatIDR(serviceFeePreview)}</span>
                    </div>
                    <div className="h-px bg-[#2D3E10]/5 my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2D3E10]/60">Total Bayar</span>
                      <span className="text-2xl font-black text-primary tracking-tight">
                        {formatIDR(Math.max(0, Math.round(Number(draft.amountEstimate) || 0)) + serviceFeePreview)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agreements */}
            <div className="px-2 pt-4">
              <label className="flex cursor-pointer items-start gap-4 group">
                <div className="relative flex h-6 w-6 shrink-0 items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="peer h-full w-full cursor-pointer appearance-none rounded-[0.7rem] border-2 border-[#E8E8E1] bg-white transition-all duration-500 checked:border-primary checked:bg-primary hover:border-primary/40"
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
                <span className="text-[11px] font-medium leading-relaxed text-[#2D3E10]/50 transition-colors group-hover:text-[#2D3E10]">
                  Saya menyetujui <button onClick={() => setShowPrivacyModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/20 hover:text-primary">Syarat & Ketentuan</button>, <button onClick={() => setShowPrivacyModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/20 hover:text-primary">Kebijakan Privasi</button>, dan <button onClick={() => setShowCancellationModal(true)} className="font-bold text-[#2D3E10] underline decoration-primary/20 hover:text-primary">Kebijakan Pembatalan</button> yang berlaku.
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-4 text-red-600">
                  <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-bold">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-[#E8E8E1] bg-white/80 p-4 backdrop-blur-xl sm:p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:gap-4">
          <button
            type="button"
            disabled={submitting || !agreed}
            onClick={() => confirmAndPay()}
            className="group relative order-1 flex min-h-[3.75rem] w-full flex-[2] items-center justify-center overflow-hidden rounded-2xl bg-[#2D3E10] px-8 py-4 text-[12px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-[#2D3E10]/10 transition-all hover:bg-[#1A2508] active:scale-[0.98] disabled:opacity-30 sm:order-2"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
            <span className="relative z-10">{submitting ? "Memproses..." : "Konfirmasi & Bayar Sekarang"}</span>
            <svg className="relative z-10 ml-3 h-4 w-4 transition-transform duration-500 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => router.back()}
            className="order-2 flex min-h-[3.75rem] w-full flex-1 items-center justify-center rounded-2xl border border-[#E8E8E1] bg-white px-8 py-4 text-[12px] font-black uppercase tracking-[0.2em] text-[#2D3E10] transition-all hover:bg-[#F1F3EE] active:scale-[0.98] sm:order-1"
          >
            Kembali
          </button>
        </div>
      </div>

      {/* Modals */}
      <Modal open={showPrivacyModal} title="Kebijakan Privasi" onClose={() => setShowPrivacyModal(false)} maxWidthClassName="max-w-xl">
        <div className="space-y-6 py-4">
          <div className="rounded-2xl bg-[#F1F3EE]/50 p-6 text-sm font-medium leading-relaxed text-[#2D3E10]/70">
            Kami menghargai privasi Anda. Data yang dikumpulkan hanya digunakan untuk keperluan reservasi dan peningkatan layanan di Woodforest Jayagiri 48.
          </div>
          <div className="space-y-4">
            {[
              { t: "Pengumpulan Data", d: "Kami mencatat nama, kontak, dan detail pesanan Anda." },
              { t: "Penggunaan Data", d: "Informasi digunakan untuk konfirmasi, invoice, dan layanan tamu." },
              { t: "Keamanan", d: "Data Anda disimpan secara aman dan tidak dibagikan ke pihak ketiga." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-black text-primary">{i+1}</span>
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[#2D3E10]">{item.t}</h4>
                  <p className="text-sm font-medium text-[#2D3E10]/50">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPrivacyModal(false)} className="w-full py-4 bg-[#2D3E10] text-white rounded-xl text-[10px] font-black uppercase tracking-widest mt-4 transition-all hover:bg-[#1A2508]">Tutup</button>
        </div>
      </Modal>

      <Modal open={showCancellationModal} title="Kebijakan Pembatalan" onClose={() => setShowCancellationModal(false)} maxWidthClassName="max-w-xl">
        <div className="space-y-6 py-4">
          <div className="rounded-2xl bg-amber-50 p-6 text-sm font-bold leading-relaxed text-amber-900/70 border border-amber-100">
            Penting: Pembatalan karena cuaca ekstrem demi keselamatan tamu akan diprioritaskan untuk reschedule.
          </div>
          <div className="space-y-4">
            {[
              { t: "Refund Policy", d: "DP tidak dapat dikembalikan (non-refundable) namun dapat dialihkan." },
              { t: "Reschedule", d: "Permintaan ubah jadwal maksimal 7 hari sebelum kedatangan." },
              { t: "Force Majeure", d: "Manajemen berhak membatalkan sepihak jika kondisi alam tidak memungkinkan." }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-[10px] font-black text-amber-700">{i+1}</span>
                <div className="space-y-1">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[#2D3E10]">{item.t}</h4>
                  <p className="text-sm font-medium text-[#2D3E10]/50">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowCancellationModal(false)} className="w-full py-4 bg-[#2D3E10] text-white rounded-xl text-[10px] font-black uppercase tracking-widest mt-4 transition-all hover:bg-[#1A2508]">Tutup</button>
        </div>
      </Modal>
    </div>
  );
}
