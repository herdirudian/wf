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
    <div className="min-h-dvh bg-[#090E08] text-[#F6F5F0] relative overflow-hidden pb-48 sm:pb-28">
      {/* Background Ambience Scrim */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-full max-w-4xl rounded-full bg-[#86A86C]/5 blur-[120px]" />

      {/* Top Bar - 3-Zone Contract */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090E08]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/booking?step=3")}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white transition-colors"
          >
            <span>←</span>
            <span>Ubah Data</span>
          </button>
          <div className="flex flex-col items-center">
            <span className="font-serif text-sm tracking-wider text-[#F6F5F0]">WOODFOREST JAYAGIRI 48</span>
            <span className="text-[10px] font-mono text-[#86A86C]">1.620 mdpl · Lembang</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">Tahap Akhir</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12 relative z-10">
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 cubic-bezier(0.16, 1, 0.3, 1)">
          {/* Header Section */}
          <div className="mb-8 flex flex-col text-left sm:text-center">
            <div className="flex items-center justify-start sm:justify-center gap-2 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#86A86C]" />
              <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-[#86A86C]">
                Verifikasi & Pembayaran
              </span>
            </div>
            <h1 className="text-3xl font-serif tracking-tight text-[#F6F5F0] sm:text-4xl">
              Konfirmasi Rincian Reservasi
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-white/60 max-w-lg sm:mx-auto leading-relaxed">
              1.620 mdpl · Periksa kembali akomodasi, penempatan kavling, dan identitas sebelum pengalihan ke pembayaran resmi.
            </p>
          </div>

          {/* Hold Banner */}
          {draft.hold?.expiresAt && holdLeftLabel ? (
            <div className="mb-6 rounded-2xl border border-[#86A86C]/30 bg-[#162415] p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-[#86A86C] animate-pulse" />
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                      Sisa Waktu Hold Kavling
                    </span>
                    <div className="text-base sm:text-lg font-mono tabular-nums font-bold text-[#F6F5F0]">
                      Berakhir dalam <span className="text-[#86A86C]">{holdLeftLabel}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/booking?step=2")}
                  className="rounded-xl border border-white/15 bg-[#121C11] px-4 py-2 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white transition-all"
                >
                  Pilih Ulang
                </button>
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            {/* Customer Details Card */}
            <div className="rounded-2xl border border-white/10 bg-[#121C11] p-5 sm:p-7 shadow-2xl space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                <span className="h-2 w-2 rounded-full bg-[#86A86C]" />
                <h3 className="text-base sm:text-lg font-serif text-[#F6F5F0]">Detail Tamu Pemesan</h3>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Nama Lengkap</span>
                  <p className="text-sm font-semibold text-[#F6F5F0]">{draft.customer.name}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Nomor WhatsApp</span>
                  <p className="text-sm font-mono text-[#F6F5F0]">{draft.customer.phone}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Alamat Email</span>
                  <p className="text-sm text-[#F6F5F0]">{draft.customer.email}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Jadwal Kunjungan</span>
                  <p className="text-sm font-mono tabular-nums text-[#F6F5F0]">{draft.checkIn} s/d {draft.checkOut}</p>
                  <p className="text-[11px] font-mono text-white/50">
                    {draft.totalGuest} Tamu ({draft.adultPax} Dewasa, {draft.child5to10Pax} Anak, {draft.childUnder5Pax} Balita)
                  </p>
                </div>
              </div>
            </div>

            {/* Reservation Summary Card */}
            <div className="rounded-2xl border border-white/10 bg-[#121C11] p-5 sm:p-7 shadow-2xl space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                <span className="h-2 w-2 rounded-full bg-[#86A86C]" />
                <h3 className="text-base sm:text-lg font-serif text-[#F6F5F0]">Rincian Akomodasi & Penempatan</h3>
              </div>

              <div className="space-y-4">
                {/* Units */}
                <div className="space-y-2.5">
                  {draft.display.items.map((it) => (
                    <div key={it.unitId} className="flex items-center justify-between rounded-xl bg-[#0B120A] p-4 border border-white/10">
                      <div>
                        <p className="text-sm font-serif text-[#F6F5F0]">{it.name}</p>
                        <p className="text-[10px] font-mono text-[#86A86C] uppercase tracking-wider">Unit Akomodasi Utama</p>
                      </div>
                      <div className="font-mono tabular-nums text-sm font-bold text-[#F6F5F0]">
                        {it.quantity} Unit
                      </div>
                    </div>
                  ))}
                </div>

                {/* Kavlings & Addons */}
                <div className="rounded-xl border border-white/10 bg-[#0B120A] p-4">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Titik Kavling Hutan</span>
                  <p className="mt-1 text-base font-mono tabular-nums font-bold text-[#86A86C]">{kavlingText}</p>
                </div>
                
                {draft.display.addOns.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-[#0B120A] p-4 space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Perlengkapan Tambahan</span>
                    <div className="space-y-2">
                      {draft.display.addOns.map((a) => (
                        <div key={a.addOnId} className="flex justify-between items-center text-xs">
                          <div>
                            <span className="text-[#F6F5F0] font-medium">{a.name}</span>
                            <span className="ml-2 font-mono text-white/40">× {a.quantity}</span>
                          </div>
                          <span className="font-mono tabular-nums font-semibold text-[#F6F5F0]">{formatIDR(a.price * a.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {draft.specialRequest && (
                  <div className="rounded-xl border border-white/10 bg-[#0B120A] p-4">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">Permintaan Khusus</span>
                    <p className="mt-1 text-xs text-white/70 leading-relaxed font-sans">{draft.specialRequest}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method Card */}
            <div className="rounded-2xl border border-white/10 bg-[#121C11] p-5 sm:p-7 shadow-2xl space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                <span className="h-2 w-2 rounded-full bg-[#86A86C]" />
                <h3 className="text-base sm:text-lg font-serif text-[#F6F5F0]">Kanal & Total Pembayaran</h3>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86A86C]">
                    Pilih Metode Pembayaran
                  </label>
                  <div className="relative">
                    <select
                      value={paymentMethodCode}
                      onChange={(e) => setPaymentMethodCode(e.target.value)}
                      disabled={submitting || !paymentMethods.length}
                      className="h-12 w-full appearance-none rounded-xl border border-white/15 bg-[#0B120A] px-4 text-xs sm:text-sm font-mono text-[#F6F5F0] outline-none transition-all focus:border-[#86A86C] disabled:opacity-50 cursor-pointer"
                    >
                      {paymentMethods.length ? null : <option value="">Memuat metode pembayaran...</option>}
                      {paymentMethods.map((m) => (
                        <option key={m.code} value={m.code} className="bg-[#0B120A] text-[#F6F5F0]">
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#86A86C]">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0B120A] p-5 space-y-3 font-mono">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/50 uppercase tracking-wider">Subtotal Sewa</span>
                    <span className="tabular-nums text-white/90">{formatIDR(draft.amountEstimate)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/50 uppercase tracking-wider">Biaya Transaksi</span>
                    <span className="tabular-nums text-white/90">{formatIDR(serviceFeePreview)}</span>
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-widest text-[#86A86C] font-bold">Total Pembayaran</span>
                    <span className="text-xl sm:text-2xl font-bold tabular-nums text-[#86A86C]">
                      {formatIDR(Math.max(0, Math.round(Number(draft.amountEstimate) || 0)) + serviceFeePreview)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agreements */}
            <div className="px-1 pt-2">
              <label className="flex cursor-pointer items-start gap-3 group">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#0B120A] text-[#86A86C] focus:ring-0 cursor-pointer accent-[#86A86C]"
                />
                <span className="text-xs text-white/60 leading-relaxed font-sans">
                  Saya menyetujui{" "}
                  <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-[#86A86C] underline underline-offset-2 hover:text-white">
                    Ketentuan Rimba & Privasi
                  </button>{" "}
                  serta{" "}
                  <button type="button" onClick={() => setShowCancellationModal(true)} className="text-[#86A86C] underline underline-offset-2 hover:text-white">
                    Kebijakan Pembatalan / Reschedule
                  </button>{" "}
                  di Woodforest Jayagiri 48.
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-mono text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-white/10 bg-[#090E08]/90 p-3 sm:p-4 backdrop-blur-xl shadow-2xl">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => router.back()}
            className="order-2 flex min-h-[3.25rem] w-full flex-1 items-center justify-center rounded-xl border border-white/15 bg-[#121C11] px-6 py-3 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white transition-all active:scale-[0.98] sm:order-1"
          >
            Kembali
          </button>
          <button
            type="button"
            disabled={submitting || !agreed}
            onClick={() => confirmAndPay()}
            className="order-1 flex min-h-[3.25rem] w-full flex-[2] items-center justify-center rounded-xl bg-[#86A86C] px-8 py-3 text-xs font-mono uppercase tracking-wider font-bold text-[#090E08] shadow-lg shadow-[#86A86C]/20 transition-all hover:bg-[#97ba7c] active:scale-[0.98] disabled:opacity-30 sm:order-2"
          >
            <span>{submitting ? "Menyiapkan Pembayaran..." : "Konfirmasi & Bayar Sekarang ↗"}</span>
          </button>
        </div>
      </div>

      {/* Modals - Sanctuary Variant */}
      <Modal 
        open={showPrivacyModal} 
        title="Kebijakan Privasi & Ketentuan Rimba" 
        variant="sanctuary"
        onClose={() => setShowPrivacyModal(false)} 
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4 py-2 text-xs text-white/80 leading-relaxed font-sans">
          <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
            <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">Pemanfaatan Data</h4>
            <p className="text-white/70">
              Data identitas dan kontak hanya digunakan untuk registrasi gerbang masuk, konfirmasi invoice, asuransi Perhutani, dan layanan concierge selama kunjungan di Woodforest Jayagiri 48.
            </p>
          </div>
          <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
            <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">Keamanan Transaksi</h4>
            <p className="text-white/70">
              Seluruh transaksi pembayaran diproses melalui gateway resmi berlisensi Bank Indonesia (Xendit) dengan enkripsi TLS 1.3 standar perbankan.
            </p>
          </div>
          <button 
            onClick={() => setShowPrivacyModal(false)} 
            className="w-full py-3 bg-[#86A86C] text-[#090E08] rounded-xl text-xs font-mono font-bold uppercase tracking-wider mt-4 transition-all hover:bg-[#97ba7c]"
          >
            Tutup
          </button>
        </div>
      </Modal>

      <Modal 
        open={showCancellationModal} 
        title="Kebijakan Pembatalan & Perubahan Jadwal" 
        variant="sanctuary"
        onClose={() => setShowCancellationModal(false)} 
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4 py-2 text-xs text-white/80 leading-relaxed font-sans">
          <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
            <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">Ketentuan Reschedule</h4>
            <p className="text-white/70">
              Perubahan jadwal kunjungan dapat diajukan selambat-lambatnya 7 hari kalender sebelum tanggal check-in, bergantung pada ketersediaan unit dan kavling pada tanggal pengganti.
            </p>
          </div>
          <div className="rounded-xl bg-[#0B120A] p-4 border border-white/10 space-y-2">
            <h4 className="font-mono uppercase tracking-wider text-[#86A86C] text-xs">Kondisi Cuaca Ekstrem (Force Majeure)</h4>
            <p className="text-white/70">
              Demi keselamatan tamu di kawasan hutan lindung 1.620 mdpl, penutupan jalur atau kavling akibat anomali cuaca ekstrem dari Perhutani/BMKG akan dialihkan dengan jadwal ulang bebas biaya administrasi.
            </p>
          </div>
          <button 
            onClick={() => setShowCancellationModal(false)} 
            className="w-full py-3 bg-[#86A86C] text-[#090E08] rounded-xl text-xs font-mono font-bold uppercase tracking-wider mt-4 transition-all hover:bg-[#97ba7c]"
          >
            Tutup
          </button>
        </div>
      </Modal>
    </div>
  );
}
