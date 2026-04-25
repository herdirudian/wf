"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";

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
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-3xl border border-border bg-surface/80 p-6 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold text-foreground">Konfirmasi Pesanan</div>
          <div className="mt-1 text-xs text-muted">Pastikan data sudah benar sebelum checkout.</div>
          {draft.hold?.expiresAt && holdLeftLabel ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">Hold berakhir dalam {holdLeftLabel}</div>
                <button
                  type="button"
                  onClick={() => router.push("/booking")}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Kembali pilih kavling
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-medium text-muted">Nama</div>
              <input
                value={draft.customer.name}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, name: e.target.value } } : s))}
                className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-medium text-muted">No. Telp</div>
              <input
                value={draft.customer.phone}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, phone: e.target.value } } : s))}
                className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-medium text-muted">Email</div>
              <input
                type="email"
                value={draft.customer.email}
                onChange={(e) => setDraft((s) => (s ? { ...s, customer: { ...s.customer, email: e.target.value } } : s))}
                placeholder="-"
                className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-xs font-medium text-muted">Tanggal</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {draft.checkIn} → {draft.checkOut}
              </div>
              <div className="mt-1 text-xs text-muted">Total guest: {draft.totalGuest}</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Item</div>
            <div className="mt-2 space-y-2 text-sm">
              {draft.display.items.map((it) => (
                <div key={it.unitId} className="flex items-center justify-between gap-3">
                  <div className="text-foreground">{it.name}</div>
                  <div className="text-muted">x{it.quantity}</div>
                </div>
              ))}
              {draft.display.items.length === 0 ? <div className="text-muted">-</div> : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Kavling</div>
            <div className="mt-1 text-xs text-muted">Scope: {draft.kavlingScope || "-"}</div>
            <div className="mt-2 text-sm text-foreground">{kavlingText}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Add-Ons</div>
            <div className="mt-2 space-y-2 text-sm">
              {draft.display.addOns.map((a) => (
                <div key={a.addOnId} className="flex items-center justify-between gap-3">
                  <div className="text-foreground">
                    {a.name} <span className="text-xs text-muted">({formatIDR(a.price)})</span>
                  </div>
                  <div className="text-muted">x{a.quantity}</div>
                </div>
              ))}
              {draft.display.addOns.length === 0 ? <div className="text-muted">-</div> : null}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Special Request</div>
            <textarea
              value={draft.specialRequest ?? ""}
              onChange={(e) => setDraft((s) => (s ? { ...s, specialRequest: e.target.value } : s))}
              className="mt-2 h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Contoh: minta lokasi dekat toilet, bawa anak kecil, request check-in lebih awal (jika memungkinkan)..."
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Metode Pembayaran</div>
            <div className="mt-1 text-xs text-muted">Pilih metode pembayaran dan lihat biaya layanan.</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Metode</label>
                <select
                  value={paymentMethodCode}
                  onChange={(e) => setPaymentMethodCode(e.target.value)}
                  disabled={submitting || !paymentMethods.length}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                >
                  {paymentMethods.length ? null : <option value="">Tidak ada metode</option>}
                  {paymentMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                <div className="text-xs text-muted">Biaya layanan</div>
                <div className="mt-1 font-semibold text-foreground">{formatIDR(serviceFeePreview)}</div>
                <div className="mt-1 text-xs text-muted">
                  Total dibayar: {formatIDR(Math.max(0, Math.round(Number(draft.amountEstimate) || 0)) + serviceFeePreview)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 px-2">
            <label className="flex cursor-pointer items-start gap-3 group">
              <div className="relative flex h-5 w-5 shrink-0 items-center justify-center mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-border bg-background transition-all checked:border-primary checked:bg-primary hover:border-primary/50"
                />
                <svg
                  className="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={4}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs font-medium leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">
                Dengan melanjutkan ke pembayaran, Anda dianggap telah membaca dan menyetujui{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                  className="font-bold text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                >
                  Syarat & Ketentuan
                </button>,{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                  className="font-bold text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                >
                  Kebijakan Privasi
                </button>, serta{" "}
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowCancellationModal(true); }}
                  className="font-bold text-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                >
                  Kebijakan Pembatalan
                </button> yang berlaku di{" "}
                <span className="font-bold text-foreground italic">Woodforest Jayagiri 48</span>.
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div>
              <div className="text-xs text-muted">Estimasi total</div>
              <div className="text-lg font-semibold text-foreground">{formatIDR(draft.amountEstimate)}</div>
              <div className="text-xs text-muted">Final total dihitung server saat checkout.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => router.back()}
                className="h-10 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={submitting || !agreed}
                onClick={() => confirmAndPay()}
                className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Memproses..." : "Checkout & Bayar Pelunasan"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div>{error}</div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => router.push("/booking")}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Kembali ke Booking
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal Kebijakan Privasi & S&K */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPrivacyModal(false)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="border-b border-border bg-muted/30 px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-foreground">Kebijakan Privasi & S&K</h3>
                  <p className="text-xs font-medium text-muted">Woodforest Jayagiri 48</p>
                </div>
                <button 
                  onClick={() => setShowPrivacyModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto p-8">
              <div className="prose prose-sm max-w-none space-y-6 text-sm font-medium leading-relaxed text-muted-foreground">
                <p>Kami menghargai dan melindungi privasi setiap tamu yang melakukan pemesanan melalui sistem Woodforest Jayagiri 48.</p>
                
                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">1. Pengumpulan Data</h4>
                  <p>Kami mengumpulkan informasi yang Anda berikan saat melakukan pemesanan, seperti:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Nama lengkap</li>
                    <li>Nomor telepon</li>
                    <li>Alamat email</li>
                    <li>Data identitas (jika diperlukan)</li>
                    <li>Informasi pembayaran</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">2. Penggunaan Data</h4>
                  <p>Data yang dikumpulkan digunakan untuk:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Memproses dan mengelola reservasi</li>
                    <li>Menghubungi tamu terkait pemesanan</li>
                    <li>Keperluan operasional dan pelayanan selama menginap</li>
                    <li>Peningkatan kualitas layanan</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">3. Perlindungan Data</h4>
                  <p>Kami berkomitmen menjaga keamanan data pribadi Anda dan tidak akan menyebarluaskan atau menjual data kepada pihak lain tanpa izin, kecuali diwajibkan oleh hukum.</p>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">4. Penyimpanan Data</h4>
                  <p>Data akan disimpan selama diperlukan untuk keperluan operasional dan sesuai dengan ketentuan hukum yang berlaku.</p>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">5. Persetujuan Pengguna</h4>
                  <p>Dengan melakukan pemesanan, Anda menyetujui pengumpulan dan penggunaan data sesuai kebijakan ini.</p>
                </section>
              </div>
            </div>
            <div className="border-t border-border bg-muted/30 p-6">
              <button 
                onClick={() => setShowPrivacyModal(false)}
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kebijakan Pembatalan */}
      {showCancellationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCancellationModal(false)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-border bg-surface shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="border-b border-border bg-muted/30 px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-foreground">Kebijakan Pembatalan & Refund</h3>
                  <p className="text-xs font-medium text-muted">Woodforest Jayagiri 48</p>
                </div>
                <button 
                  onClick={() => setShowCancellationModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto p-8">
              <div className="prose prose-sm max-w-none space-y-6 text-sm font-medium leading-relaxed text-muted-foreground">
                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">1. Pembatalan oleh Tamu</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Pembatalan yang dilakukan oleh tamu dapat dikenakan biaya sesuai dengan kebijakan yang berlaku pada saat pemesanan.</li>
                    <li>Down Payment (DP) yang sudah dibayarkan bersifat <span className="font-bold text-destructive">non-refundable</span> (tidak dapat dikembalikan), kecuali dalam kondisi tertentu yang diatur pada poin force majeure.</li>
                    <li>Perubahan jadwal (reschedule) dapat diajukan sesuai ketersediaan dan kebijakan manajemen.</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">2. Force Majeure (Keadaan Kahar)</h4>
                  <p>Yang termasuk force majeure antara lain:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Badai angin kencang</li>
                    <li>Hujan ekstrem</li>
                    <li>Bencana alam (longsor, gempa, dll)</li>
                    <li>Kondisi lain yang membahayakan keselamatan dan kenyamanan tamu</li>
                  </ul>
                  <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100 text-amber-700">
                    <p className="font-bold mb-1">Penting:</p>
                    <p>Mengingat lokasi Woodforest Jayagiri 48 berada di kawasan hutan, maka operasional akan ditutup sementara apabila terjadi badai angin atau kondisi berbahaya lainnya. Keputusan penutupan sepenuhnya merupakan wewenang manajemen demi keselamatan tamu.</p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">3. Kebijakan dalam Kondisi Force Majeure</h4>
                  <p>Apabila terjadi force majeure:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Tamu dapat melakukan reschedule tanpa biaya tambahan (sesuai ketersediaan)</li>
                    <li>Atau memilih refund penuh / sebagian sesuai kebijakan manajemen</li>
                    <li>Proses refund akan dilakukan dalam waktu maksimal 7–14 hari kerja</li>
                  </ul>
                </section>

                <section className="space-y-3">
                  <h4 className="text-base font-black text-foreground">4. Pembatalan oleh Pihak Woodforest</h4>
                  <p>Woodforest Jayagiri 48 berhak membatalkan reservasi apabila:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Terjadi kondisi force majeure</li>
                    <li>Terjadi kendala operasional yang tidak dapat dihindari</li>
                  </ul>
                  <p>Dalam hal ini, tamu berhak atas reschedule tanpa biaya, atau refund sesuai ketentuan yang berlaku.</p>
                </section>
              </div>
            </div>
            <div className="border-t border-border bg-muted/30 p-6">
              <button 
                onClick={() => setShowCancellationModal(false)}
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
