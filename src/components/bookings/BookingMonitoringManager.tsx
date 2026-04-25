"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";

export type MonitoringRow = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  email: string | null;
  checkIn: Date;
  status: string;
  paymentStatus: string;
  paymentAmount: number;
  paymentPaidAmount: number;
  specialRequest: string | null;
  createdAt: Date;
  checkoutUrl: string | null;
  gatewayExternalId: string | null;
  gatewayExpiresAt: Date | null;
};

export function BookingMonitoringManager({ rows, balanceDueDays, currentUserRole }: { rows: MonitoringRow[]; balanceDueDays: number; currentUserRole?: string }) {
  const isOwner = currentUserRole === "owner";
  const router = useRouter();
  const [paying, setPaying] = useState<string | null>(null);
  const [mailing, setMailing] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"all" | "dp" | "partial" | "expired" | "cancel_no_pay" | "cancelled">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [waOpeningId, setWaOpeningId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
  }, [rows]);

  function getRowStage(row: MonitoringRow) {
    const remaining = Math.max(0, row.paymentAmount - row.paymentPaidAmount);
    const isExpired = row.gatewayExpiresAt ? new Date(row.gatewayExpiresAt).getTime() < Date.now() : false;
    const isPaid = remaining <= 0 || row.paymentStatus === "paid";
    const isCancelled = String(row.status) === "cancelled";
    const isNoPayCancelled = isCancelled && String(row.paymentStatus) === "expired" && row.paymentPaidAmount <= 0;
    if (isNoPayCancelled) return "cancel_no_pay" as const;
    if (isCancelled) return "cancelled" as const;
    if (isPaid) return "paid" as const;
    if (row.paymentStatus === "expired" || isExpired) return "expired" as const;
    if (row.paymentPaidAmount > 0) return "partial" as const;
    return "dp" as const;
  }

  function getBalanceDueAt(checkIn: Date) {
    const base = checkIn.getTime();
    const days = Math.max(0, Number(balanceDueDays) || 0);
    return new Date(base - days * 24 * 60 * 60 * 1000);
  }

  function isOverdue(checkIn: Date, remaining: number) {
    if (remaining <= 0) return false;
    const dueAt = getBalanceDueAt(checkIn);
    const endOfDueAt = dueAt.getTime() + 24 * 60 * 60 * 1000 - 1;
    return Date.now() > endOfDueAt;
  }

  const filteredRows = useMemo(() => {
    if (quickFilter === "all") return sortedRows;
    return sortedRows.filter((r) => getRowStage(r) === quickFilter);
  }, [quickFilter, sortedRows]);

  const filterCounts = useMemo(() => {
    const c = { all: sortedRows.length, dp: 0, partial: 0, expired: 0, cancel_no_pay: 0, cancelled: 0 };
    for (const r of sortedRows) {
      const st = getRowStage(r);
      if (st === "dp") c.dp += 1;
      else if (st === "partial") c.partial += 1;
      else if (st === "expired") c.expired += 1;
      else if (st === "cancel_no_pay") c.cancel_no_pay += 1;
      else if (st === "cancelled") c.cancelled += 1;
    }
    return c;
  }, [sortedRows]);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  async function sendEmailReminder(id: string) {
    setMailing(id);
    try {
      const res = await fetch("/api/dashboard/bookings/send-reminder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal kirim email");
      alert("Email pengingat berhasil dikirim");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengirim email");
    } finally {
      setMailing(null);
    }
  }

  async function payWithXendit(code: string, id: string, mode: "dp" | "balance") {
    setPaying(id);
    try {
      const res = await fetch(`/api/public/bookings/${code}/pay?mode=${mode}`, { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Gagal membuat invoice");
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memproses pembayaran");
    } finally {
      setPaying(null);
    }
  }

  function suggestedPayMode(row: MonitoringRow) {
    return row.paymentPaidAmount > 0 ? "balance" : "dp";
  }

  async function ensureXenditUrl(row: MonitoringRow, modeOverride?: "dp" | "balance") {
    const isExpired = row.gatewayExpiresAt ? new Date(row.gatewayExpiresAt).getTime() < Date.now() : false;
    const current = row.checkoutUrl ?? "";
    const want = modeOverride ?? suggestedPayMode(row);
    const existingKind = (() => {
      const s = String(row.gatewayExternalId ?? "");
      if (!s.startsWith("wf_payment_")) return null;
      const parts = s.split("_");
      if (parts.length < 5) return null;
      const kind = parts[parts.length - 2];
      return kind === "dp" || kind === "balance" ? (kind as "dp" | "balance") : null;
    })();
    if (current && !isExpired && (!existingKind || existingKind === want)) return current;
    const mode = modeOverride ?? suggestedPayMode(row);
    const res = await fetch(`/api/public/bookings/${row.code}/pay?mode=${mode}`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as { invoiceUrl?: string; message?: string } | null;
    if (!res.ok) throw new Error(data?.message || "Gagal membuat invoice");
    const url = data?.invoiceUrl ?? "";
    if (!url) throw new Error("Link Xendit tidak tersedia");
    return url;
  }

  async function logWaClick(id: string) {
    try {
      await fetch("/api/dashboard/bookings/log-wa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: id }),
      });
      router.refresh();
    } catch (e) {
      console.error("Gagal mencatat log WA:", e);
    }
  }

  function getDaysUntil(date: Date) {
    const diff = date.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function cleanPhone(phone: string) {
    let p = phone.replace(/[^0-9]/g, "");
    if (p.startsWith("0")) p = "62" + p.slice(1);
    if (p.startsWith("8")) p = "62" + p;
    return p;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQuickFilter("all")}
          className={`flex min-h-[2.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 ${
            quickFilter === "all" ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-foreground hover:bg-background"
          }`}
        >
          Semua ({filterCounts.all})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter("dp")}
          className={`flex min-h-[2.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 ${
            quickFilter === "dp" ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-foreground hover:bg-background"
          }`}
        >
          DP ({filterCounts.dp})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter("partial")}
          className={`flex min-h-[2.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 ${
            quickFilter === "partial"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground hover:bg-background"
          }`}
        >
          DP Received ({filterCounts.partial})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter("expired")}
          className={`flex min-h-[2.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 ${
            quickFilter === "expired"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground hover:bg-background"
          }`}
        >
          Expired ({filterCounts.expired})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter("cancel_no_pay")}
          className={`flex min-h-[2.25rem] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-95 ${
            quickFilter === "cancel_no_pay"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground hover:bg-background"
          }`}
        >
          Cancel (Tidak Bayar) ({filterCounts.cancel_no_pay})
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Booking</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Check-In</th>
              <th className="px-4 py-3 font-medium">Sisa Tagihan</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.map((row) => {
              const days = getDaysUntil(row.checkIn);
              const remaining = Math.max(0, row.paymentAmount - row.paymentPaidAmount);
              const dueAt = getBalanceDueAt(row.checkIn);
              const overdue = isOverdue(row.checkIn, remaining);
              
              let badgeCls = "bg-muted/10 text-muted";
              if (row.paymentStatus === "pending") badgeCls = "bg-yellow-500/10 text-yellow-700";
              else if (row.paymentStatus === "partial") badgeCls = "bg-blue-500/10 text-blue-700";
              else if (row.paymentStatus === "paid") badgeCls = "bg-emerald-500/10 text-emerald-700";
              else if (row.paymentStatus === "expired") badgeCls = "bg-red-500/10 text-red-700";

              const waPhone = cleanPhone(row.phone);

              return (
                <tr key={row.id} className="text-foreground">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{row.code}</div>
                    <div className="text-[11px] text-muted">Dibuat: {formatDateWIB(row.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.customerName}</div>
                    <div className="text-xs text-muted">{row.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={days <= 7 ? "font-bold text-red-600" : ""}>
                      {formatDateWIB(row.checkIn)}
                    </div>
                    <div className="text-[11px] text-muted">
                      {days === 0 ? "Hari ini" : days < 0 ? `${Math.abs(days)} hari lalu` : `${days} hari lagi`}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatIDR(remaining)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${badgeCls}`}>
                      {row.paymentStatus}
                    </span>
                    <div className="mt-1 text-[11px] text-muted">
                      Paid: {formatIDR(row.paymentPaidAmount)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {getRowStage(row) === "dp"
                        ? "Stage: DP belum masuk"
                        : getRowStage(row) === "partial"
                          ? "Stage: DP received"
                          : getRowStage(row) === "expired"
                            ? "Stage: Expired"
                            : ""}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">Jatuh tempo pelunasan: {formatDateWIB(dueAt)}</div>
                    {overdue ? (
                      <div className="mt-1 inline-flex items-center rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-red-700">
                        Overdue
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => sendEmailReminder(row.id)}
                        disabled={mailing === row.id || row.paymentStatus === "paid" || isOwner}
                        className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-border bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-all active:scale-95 hover:bg-slate-100 disabled:opacity-50"
                        title="Kirim ulang email tagihan"
                      >
                        {mailing === row.id ? "..." : "Kirim Email"}
                      </button>
                      <button
                        onClick={() => payWithXendit(row.code, row.id, "dp")}
                        disabled={paying === row.id || row.paymentStatus === "paid" || row.paymentPaidAmount > 0 || isOwner}
                        className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-border bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition-all active:scale-95 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {paying === row.id ? "..." : "Xendit DP"}
                      </button>
                      <button
                        onClick={() => payWithXendit(row.code, row.id, "balance")}
                        disabled={paying === row.id || row.paymentStatus === "paid" || isOwner}
                        className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-border bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition-all active:scale-95 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {paying === row.id ? "..." : "Xendit Pelunasan"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!mounted) return;
                          setCopyingId(row.id);
                          let xenditUrl = "";
                          try {
                            xenditUrl = await ensureXenditUrl(row);
                          } catch (e) {
                            setCopyingId(null);
                            alert(e instanceof Error ? e.message : "Gagal membuat link Xendit");
                            return;
                          }

                          const dueText = formatDateWIB(dueAt);
                          const paidText = formatIDR(row.paymentPaidAmount);
                          const remainingText = formatIDR(remaining);
                          const stage = getRowStage(row);

                          const waMessage =
                            stage === "partial"
                              ? overdue
                                ? `Halo ${row.customerName},\n\nReminder pelunasan booking ${row.code}.\n\n` +
                                  `DP sudah diterima: ${paidText}\n` +
                                  `Sisa tagihan: ${remainingText}\n` +
                                  `Jatuh tempo: ${dueText} (sudah lewat)\n\n` +
                                  `Silakan selesaikan pembayaran melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                                : `Halo ${row.customerName},\n\nTerima kasih, DP booking ${row.code} sudah kami terima.\n\n` +
                                  `DP: ${paidText}\n` +
                                  `Sisa tagihan: ${remainingText}\n` +
                                  `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                  `Silakan selesaikan pembayaran melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                              : stage === "dp"
                                ? `Halo ${row.customerName},\n\nKami dari Woodforest Jayagiri ingin mengkonfirmasi pembayaran untuk booking ${row.code}.\n\n` +
                                  `Total tagihan: ${formatIDR(row.paymentAmount)}\n` +
                                  `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                  `Silakan lakukan pembayaran (DP/pembayaran awal) melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                                : `Halo ${row.customerName},\n\nReminder pembayaran untuk booking ${row.code}.\n\n` +
                                  `Sisa tagihan: ${remainingText}\n` +
                                  `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                  `Link pembayaran:\n${xenditUrl}\n\nTerima kasih!`;

                          const ok = await copyToClipboard(waMessage);
                          if (ok) {
                            setCopiedId(row.id);
                            setTimeout(() => setCopiedId((prev) => (prev === row.id ? null : prev)), 1200);
                            await logWaClick(row.id);
                          } else {
                            alert("Gagal copy. Coba dari browser lain.");
                          }
                          setCopyingId(null);
                        }}
                        className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-border bg-white px-2 py-1 text-xs font-semibold text-foreground shadow-sm transition-all active:scale-95 hover:bg-background"
                      >
                        {copiedId === row.id ? "Copied" : copyingId === row.id ? "..." : "Copy WA"}
                      </button>
                      <button
                        type="button"
                        disabled={!mounted || waOpeningId === row.id}
                        onClick={async () => {
                          if (!mounted) return;
                          setWaOpeningId(row.id);
                          try {
                            const xenditUrl = await ensureXenditUrl(row);
                            const dueText = formatDateWIB(dueAt);
                            const paidText = formatIDR(row.paymentPaidAmount);
                            const remainingText = formatIDR(remaining);
                            const stage = getRowStage(row);
                            const msg =
                              stage === "partial"
                                ? overdue
                                  ? `Halo ${row.customerName},\n\nReminder pelunasan booking ${row.code}.\n\n` +
                                    `DP sudah diterima: ${paidText}\n` +
                                    `Sisa tagihan: ${remainingText}\n` +
                                    `Jatuh tempo: ${dueText} (sudah lewat)\n\n` +
                                    `Silakan selesaikan pembayaran melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                                  : `Halo ${row.customerName},\n\nTerima kasih, DP booking ${row.code} sudah kami terima.\n\n` +
                                    `DP: ${paidText}\n` +
                                    `Sisa tagihan: ${remainingText}\n` +
                                    `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                    `Silakan selesaikan pembayaran melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                                : stage === "dp"
                                  ? `Halo ${row.customerName},\n\nKami dari Woodforest Jayagiri ingin mengkonfirmasi pembayaran untuk booking ${row.code}.\n\n` +
                                    `Total tagihan: ${formatIDR(row.paymentAmount)}\n` +
                                    `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                    `Silakan lakukan pembayaran (DP/pembayaran awal) melalui link berikut:\n${xenditUrl}\n\nTerima kasih!`
                                  : `Halo ${row.customerName},\n\nReminder pembayaran untuk booking ${row.code}.\n\n` +
                                    `Sisa tagihan: ${remainingText}\n` +
                                    `Jatuh tempo pelunasan: ${dueText}\n\n` +
                                    `Link pembayaran:\n${xenditUrl}\n\nTerima kasih!`;
                            const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
                            window.open(url, "_blank");
                            await logWaClick(row.id);
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "Gagal membuka WA");
                          } finally {
                            setWaOpeningId(null);
                          }
                        }}
                        className="rounded-lg border border-border bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        {waOpeningId === row.id ? "..." : "WA Follow Up"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Tidak ada data monitoring.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
