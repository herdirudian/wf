"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";

type Row = {
  id: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalGuest: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  customer: { name: string; phone: string; email: string | null };
  payment: { status: string; amount: number; paidAmount: number; serviceFeeAmount: number; method: string | null } | null;
  kavlings: number[];
  items: Array<{ name: string; quantity: number }>;
};

export function FrontOfficeManager({
  rows,
  currentUserRole,
  initialCheckInDate,
  kavlingBoard,
}: {
  rows: Row[];
  currentUserRole: string;
  initialCheckInDate?: string;
  kavlingBoard?: { numbers: number[]; statusByNumber: Record<number, "booked" | "checked_in" | "checked_out"> } | null;
}) {
  const router = useRouter();
  const [actingId, setActingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [checkInDate, setCheckInDate] = useState(initialCheckInDate ?? "");
  const [exporting, setExporting] = useState(false);
  const isFO = currentUserRole === "front_office";

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      if (r.code.toLowerCase().includes(s)) return true;
      if (r.customer.name.toLowerCase().includes(s)) return true;
      if (r.customer.phone.toLowerCase().includes(s)) return true;
      return false;
    });
  }, [q, rows]);

  function setDateParam(next: string) {
    const v = next.trim();
    const url = v ? `/dashboard/front-office?date=${encodeURIComponent(v)}` : "/dashboard/front-office";
    router.push(url);
  }

  async function markCheckIn(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/checkin`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal check-in");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal check-in");
    } finally {
      setActingId(null);
    }
  }

  async function markCheckOut(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/checkout`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal check-out");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal check-out");
    } finally {
      setActingId(null);
    }
  }

  function handleExportCsv() {
    if (!checkInDate) {
      alert("Silakan pilih tanggal check-in terlebih dahulu untuk export.");
      return;
    }
    const url = `/api/dashboard/export?resource=front-office&start=${encodeURIComponent(checkInDate)}&end=${encodeURIComponent(checkInDate)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard Resepsionis</h1>
          <p className="text-sm text-muted">Daftar booking yang sudah ada pembayaran. Tandai check-in dan check-out.</p>
          {!isFO ? <p className="mt-1 text-xs text-muted">Akses terbaik untuk role front_office.</p> : null}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-foreground transition-all hover:bg-muted/10 active:scale-95 sm:mb-0"
          >
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <div className="w-full sm:w-56">
            <div className="text-xs font-medium text-foreground">Tanggal check-in</div>
            <input
              type="date"
              value={checkInDate}
              onChange={(e) => {
                const v = e.target.value;
                setCheckInDate(v);
                setDateParam(v);
              }}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="w-full sm:w-72">
            <div className="text-xs font-medium text-foreground">Cari</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              placeholder="Kode / Nama / No. HP"
            />
          </div>
        </div>
      </div>

      {kavlingBoard ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Kavling ({checkInDate})</div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-surface ring-1 ring-border" />
                Kosong
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-muted/30 ring-1 ring-border" />
                Sudah booking
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-emerald-600 ring-1 ring-emerald-700" />
                Check-in
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded bg-red-600 ring-1 ring-red-700" />
                Check-out
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {kavlingBoard.numbers.map((n) => {
              const st = kavlingBoard.statusByNumber[n];
              const cls =
                st === "checked_out"
                  ? "bg-red-600 text-white border-red-700"
                  : st === "checked_in"
                    ? "bg-emerald-600 text-white border-emerald-700"
                    : st === "booked"
                      ? "bg-muted/30 text-muted-foreground border-border"
                      : "bg-surface text-foreground border-border";
              return (
                <div
                  key={n}
                  className={`h-8 min-w-8 select-none rounded-lg border px-2 text-center text-xs font-semibold leading-8 ${cls}`}
                >
                  {n}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Booking</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Kavling</th>
              <th className="px-4 py-3 font-medium">Pembayaran</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Check-out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const grossPaid = (r.payment?.paidAmount ?? 0) + (r.payment?.serviceFeeAmount ?? 0);
              const grossTotal = (r.payment?.amount ?? 0) + (r.payment?.serviceFeeAmount ?? 0);
              const canIn = !r.checkedInAt && !r.checkedOutAt;
              const canOut = !!r.checkedInAt && !r.checkedOutAt;
              return (
                <tr key={r.id} className="text-foreground">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.code}</div>
                    <div className="text-xs text-muted">{r.status}</div>
                    <div className="text-xs text-muted">
                      {r.items.map((x) => `${x.name} x${x.quantity}`).join("; ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.customer.name}</div>
                    <div className="text-xs text-muted">{r.customer.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>In: {formatDateWIB(new Date(r.checkIn))}</div>
                    <div>Out: {formatDateWIB(new Date(r.checkOut))}</div>
                    <div>Tamu: {r.totalGuest}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{r.kavlings.length ? r.kavlings.join(", ") : "-"}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>P: {r.payment?.status ?? "-"}</div>
                    <div>{formatIDR(grossPaid)}/{formatIDR(grossTotal)}</div>
                    <div>{r.payment?.method ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.checkedInAt ? (
                      <div className="text-xs text-muted">{formatDateWIB(new Date(r.checkedInAt))}</div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canIn || actingId === r.id}
                        onClick={() => markCheckIn(r.id)}
                        className="flex min-h-[2.5rem] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                      >
                        {actingId === r.id ? "..." : "Check-in"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.checkedOutAt ? (
                      <div className="text-xs text-muted">{formatDateWIB(new Date(r.checkedOutAt))}</div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canOut || actingId === r.id}
                        onClick={() => markCheckOut(r.id)}
                        className="flex min-h-[2.5rem] items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-bold text-foreground hover:bg-background disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                      >
                        {actingId === r.id ? "..." : "Check-out"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Tidak ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
