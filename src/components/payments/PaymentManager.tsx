"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { formatDateTimeWIB, formatIDR } from "@/lib/format";

export type PaymentStatus = "pending" | "partial" | "paid" | "expired";

export type PaymentRow = {
  id: string;
  bookingCode: string;
  customerName: string;
  amount: number;
  paidAmount: number;
  serviceFeeAmount: number;
  status: PaymentStatus;
  method: string;
  paidAt: string | null;
};

export function PaymentManager({ rows, currentUserRole }: { rows: PaymentRow[]; currentUserRole?: string }) {
  const isOwner = currentUserRole === "owner";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [method, setMethod] = useState("manual");
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<PaymentRow | null>(null);
  const [addMethod, setAddMethod] = useState("manual");
  const [addAmount, setAddAmount] = useState<number>(0);
  const [histOpen, setHistOpen] = useState(false);
  const [histTarget, setHistTarget] = useState<PaymentRow | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [histItems, setHistItems] = useState<
    Array<{
      id: string;
      createdAt: string;
      action: string;
      amountDelta: number;
      paidAmountBefore: number;
      paidAmountAfter: number;
      method: string | null;
      adminEmail: string | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const title = useMemo(() => (target ? `Mark Paid: ${target.bookingCode}` : "Mark Paid"), [target]);
  const addTitle = useMemo(() => (addTarget ? `Tambah Pembayaran: ${addTarget.bookingCode}` : "Tambah Pembayaran"), [addTarget]);
  const addRemaining = useMemo(() => {
    if (!addTarget) return 0;
    return Math.max(0, addTarget.amount - addTarget.paidAmount);
  }, [addTarget]);

  function openPaid(p: PaymentRow) {
    setTarget(p);
    setMethod("manual");
    setError(null);
    setOpen(true);
  }

  function openAdd(p: PaymentRow) {
    setAddTarget(p);
    setAddMethod("manual");
    setAddAmount(Math.max(0, p.amount - p.paidAmount));
    setError(null);
    setAddOpen(true);
  }

  async function openHistory(p: PaymentRow) {
    setHistTarget(p);
    setHistOpen(true);
    setHistLoading(true);
    setHistError(null);
    setHistItems([]);
    const res = await fetch(`/api/payments/${p.id}/transactions`);
    const data = (await res.json().catch(() => null)) as { items?: typeof histItems; message?: string } | null;
    if (!res.ok) {
      setHistLoading(false);
      setHistError(data?.message ?? "Gagal load histori");
      return;
    }
    setHistItems(Array.isArray(data?.items) ? data!.items : []);
    setHistLoading(false);
  }

  async function markPending(p: PaymentRow) {
    const res = await fetch(`/api/payments/${p.id}/pending`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal update payment");
      return;
    }
    router.refresh();
  }

  async function payWithXendit(p: PaymentRow) {
    setPaying(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/public/bookings/${p.bookingCode}/pay`, { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Gagal membuat invoice");
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memproses pembayaran");
    } finally {
      setPaying(null);
    }
  }

  async function reconcileFromXendit(p: PaymentRow) {
    const res = await fetch(`/api/payments/${p.id}/reconcile`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      alert(data?.message ?? "Gagal sync Xendit");
      return;
    }
    router.refresh();
  }

  async function addPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addTarget) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/payments/${addTarget.id}/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: addAmount, method: addMethod }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "Gagal tambah pembayaran");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setAddOpen(false);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/payments/${target.id}/paid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "Gagal update payment");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-background text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Booking</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Paid/Total</th>
            <th className="px-4 py-3 font-medium">Biaya</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Method</th>
            <th className="px-4 py-3 font-medium">Paid At</th>
            <th className="px-4 py-3 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((p) => (
            <tr key={p.id} className="text-foreground">
              <td className="px-4 py-3 font-medium text-foreground">{p.bookingCode}</td>
              <td className="px-4 py-3">{p.customerName}</td>
              <td className="px-4 py-3">
                {formatIDR(p.paidAmount)}/{formatIDR(p.amount)}
              </td>
              <td className="px-4 py-3">{formatIDR(p.serviceFeeAmount)}</td>
              <td className="px-4 py-3">{p.status}</td>
              <td className="px-4 py-3">{p.method}</td>
              <td className="px-4 py-3 text-xs text-muted">{p.paidAt ? p.paidAt.slice(0, 10) : "-"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={paying === p.id || isOwner}
                    onClick={() => payWithXendit(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-emerald-50 px-3 py-1 text-xs text-emerald-700 shadow-sm transition-all active:scale-95 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {paying === p.id ? "..." : "Xendit"}
                  </button>
                  <button
                    type="button"
                    disabled={isOwner}
                    onClick={() => reconcileFromXendit(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background disabled:opacity-50"
                  >
                    Sync
                  </button>
                  <button
                    type="button"
                    disabled={isOwner}
                    onClick={() => openPaid(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background disabled:opacity-50"
                  >
                    Mark Paid
                  </button>
                  <button
                    type="button"
                    disabled={isOwner}
                    onClick={() => openAdd(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background disabled:opacity-50"
                  >
                    Tambah
                  </button>
                  <button
                    type="button"
                    onClick={() => openHistory(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                  >
                    History
                  </button>
                  <button
                    type="button"
                    disabled={isOwner}
                    onClick={() => markPending(p)}
                    className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background disabled:opacity-50"
                  >
                    Set Pending
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-muted" colSpan={8}>
                Belum ada data
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Method</label>
            <input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-[2.75rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-sm font-medium text-foreground shadow-sm transition-all active:scale-95 hover:bg-background"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[2.75rem] min-w-[100px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={addOpen} title={addTitle} onClose={() => setAddOpen(false)}>
        <form className="space-y-3" onSubmit={addPayment}>
          <div className="text-xs text-muted">Sisa tagihan: {formatIDR(addRemaining)}</div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Nominal</label>
            <input
              type="number"
              min={1}
              max={addRemaining}
              value={addAmount}
              onChange={(e) => setAddAmount(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Method</label>
            <input
              value={addMethod}
              onChange={(e) => setAddMethod(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="flex min-h-[2.75rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-sm font-medium text-foreground shadow-sm transition-all active:scale-95 hover:bg-background"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[2.75rem] min-w-[100px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={histOpen} title={histTarget ? `History: ${histTarget.bookingCode}` : "History"} onClose={() => setHistOpen(false)}>
        <div className="space-y-3">
          {histError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{histError}</div> : null}
          {histLoading ? <div className="text-sm text-muted">Loading...</div> : null}
          {!histLoading ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-background text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Waktu</th>
                    <th className="px-3 py-2 font-medium">Aksi</th>
                    <th className="px-3 py-2 font-medium">Delta</th>
                    <th className="px-3 py-2 font-medium">Paid</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {histItems.map((x) => (
                    <tr key={x.id} className="text-foreground">
                      <td className="px-3 py-2 text-xs text-muted">{formatDateTimeWIB(x.createdAt)} WIB</td>
                      <td className="px-3 py-2 text-xs text-muted">{x.action}</td>
                      <td className="px-3 py-2">{formatIDR(x.amountDelta)}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {formatIDR(x.paidAmountBefore)} → {formatIDR(x.paidAmountAfter)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{x.method ?? "-"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{x.adminEmail ?? "-"}</td>
                    </tr>
                  ))}
                  {histItems.length === 0 && !histError ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-muted" colSpan={6}>
                        Belum ada histori
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

