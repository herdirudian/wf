"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";

type OccupancyDay = { date: string; allotment: number; booked: number; available: number };
type OccupancyUnit = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  isActive: boolean;
  totalUnits: number;
  daily: OccupancyDay[];
};

type BookingRow = {
  id: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  customerName: string;
  phone: string;
  quantity: number;
};

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekendISO(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return days[d.getDay()];
}

export function OccupancyCalendar() {
  const [start, setStart] = useState(startOfTodayISO());
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [type, setType] = useState<"" | "tenda" | "cabin">("");
  const [category, setCategory] = useState<"" | "paket" | "mandiri" | "unit">("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OccupancyUnit[]>([]);

  const dateCols = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < days; i++) out.push(addDaysISO(start, i));
    return out;
  }, [start, days]);

  async function load() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/dashboard/occupancy", window.location.origin);
    url.searchParams.set("start", start);
    url.searchParams.set("days", String(days));
    if (type) url.searchParams.set("type", type);
    if (category) url.searchParams.set("category", category);
    if (includeInactive) url.searchParams.set("includeInactive", "true");

    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as { items?: OccupancyUnit[]; message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal load data");
      setLoading(false);
      return;
    }
    setItems(data?.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ unitId: string; unitName: string; date: string } | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingRows, setBookingRows] = useState<BookingRow[]>([]);

  async function openCell(unit: OccupancyUnit, date: string) {
    setSelected({ unitId: unit.id, unitName: unit.name, date });
    setOpen(true);
    setBookingRows([]);
    setBookingError(null);
    setBookingLoading(true);

    const url = new URL("/api/dashboard/occupancy/bookings", window.location.origin);
    url.searchParams.set("unitId", unit.id);
    url.searchParams.set("date", date);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as { items?: BookingRow[]; message?: string } | null;
    if (!res.ok) {
      setBookingError(data?.message ?? "Gagal load booking");
      setBookingLoading(false);
      return;
    }
    setBookingRows(data?.items ?? []);
    setBookingLoading(false);
  }

  function lowThreshold(allotment: number) {
    return Math.max(1, Math.ceil(allotment * 0.2));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar Occupancy</h1>
          <p className="text-sm text-muted">Highlight penuh/low stock. Klik cell untuk lihat booking list.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Start</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Days</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30)}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "" | "tenda" | "cabin")}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Semua</option>
              <option value="tenda">Tenda</option>
              <option value="cabin">Cabin</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as "" | "paket" | "mandiri" | "unit")}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Semua</option>
              <option value="paket">Paket</option>
              <option value="mandiri">Mandiri</option>
              <option value="unit">Unit</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-1 text-sm text-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Tampilkan nonaktif
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={load}
            className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Penuh
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" /> Low stock
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted">
          <span className="h-2 w-2 rounded-full bg-border" /> Weekend
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-max text-sm">
          <thead className="bg-background text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-background px-4 py-3 text-left font-medium">Unit</th>
              {dateCols.map((d) => (
                <th key={d} className={`px-3 py-2 text-center font-medium ${isWeekendISO(d) ? "bg-background" : ""}`}>
                  <div className="text-[11px]">{dayLabel(d)}</div>
                  <div className="text-[11px] opacity-70">{d.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((u) => (
              <tr key={u.id} className={`text-foreground ${u.isActive ? "" : "opacity-60"}`}>
                <td className="sticky left-0 z-10 bg-surface px-4 py-3">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">
                    {u.type}
                    {u.category ? ` · ${u.category}` : ""} · {u.isActive ? "aktif" : "nonaktif"}
                  </div>
                </td>
                {u.daily.map((x) => {
                  const full = x.available <= 0;
                  const low = !full && x.available <= lowThreshold(x.allotment);
                  const weekend = isWeekendISO(x.date);
                  const cellClass = full
                    ? "border-red-200 bg-red-50"
                    : low
                      ? "border-border bg-accent/15"
                      : weekend
                        ? "border-border bg-background"
                        : "border-border bg-surface";
                  return (
                    <td key={x.date} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => openCell(u, x.date)}
                        className={`w-20 rounded-xl border px-2 py-2 text-left hover:bg-background ${cellClass}`}
                      >
                        <div className={`text-base font-semibold ${full ? "text-red-700" : "text-foreground"}`}>
                          {x.available}
                        </div>
                        <div className="text-[11px] text-muted">
                          /{x.allotment} · {x.booked} booked
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted" colSpan={1 + dateCols.length}>
                  Tidak ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Booking List" onClose={() => setOpen(false)}>
        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">{selected ? `${selected.unitName} · ${selected.date}` : "-"}</div>
          {bookingError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{bookingError}</div>
          ) : null}
          {bookingLoading ? <div className="text-sm text-muted">Loading...</div> : null}
          {!bookingLoading && !bookingRows.length ? <div className="text-sm text-muted">Tidak ada booking.</div> : null}
          {bookingRows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-background text-left text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Qty</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface text-foreground">
                  {bookingRows.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-medium">{b.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{b.customerName}</div>
                        <div className="text-xs text-muted">{b.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <div>In: {b.checkIn}</div>
                        <div>Out: {b.checkOut}</div>
                      </td>
                      <td className="px-4 py-3">{b.quantity}</td>
                      <td className="px-4 py-3 text-xs text-muted">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

