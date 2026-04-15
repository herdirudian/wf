"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";

type BookingBlock = {
  bookingId: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  customerName: string;
  phone: string;
  quantity: number;
};

type UnitRow = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  isActive: boolean;
  bookings: BookingBlock[];
};

type ApiResponse = {
  start: string;
  endExclusive: string;
  days: number;
  units: UnitRow[];
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

function diffDaysISO(a: string, b: string) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
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

function statusColor(status: string) {
  if (status === "paid") return "bg-emerald-100 border-emerald-200 text-emerald-900";
  if (status === "completed") return "bg-emerald-100 border-emerald-200 text-emerald-900";
  if (status === "pending") return "bg-amber-100 border-amber-200 text-amber-900";
  return "bg-surface border-border text-foreground";
}

type PositionedBlock = BookingBlock & { startIdx: number; endIdx: number; lane: number };

function lanePack(blocks: Array<{ startIdx: number; endIdx: number }>) {
  const lanes: number[] = [];
  const laneFor: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let lane = -1;
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] <= b.startIdx) {
        lane = j;
        break;
      }
    }
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(b.endIdx);
    } else {
      lanes[lane] = b.endIdx;
    }
    laneFor.push(lane);
  }
  return { laneFor, laneCount: lanes.length };
}

export function BookingsBlockingChart() {
  const [start, setStart] = useState(startOfTodayISO());
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [type, setType] = useState<"" | "tenda" | "cabin">("");
  const [category, setCategory] = useState<"" | "paket" | "mandiri" | "unit">("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const dateCols = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < days; i++) out.push(addDaysISO(start, i));
    return out;
  }, [start, days]);

  async function load() {
    setLoading(true);
    setError(null);
    const url = new URL("/api/dashboard/bookings-chart", window.location.origin);
    url.searchParams.set("start", start);
    url.searchParams.set("days", String(days));
    if (type) url.searchParams.set("type", type);
    if (category) url.searchParams.set("category", category);
    if (includeInactive) url.searchParams.set("includeInactive", "true");

    const res = await fetch(url.toString());
    const json = (await res.json().catch(() => null)) as ApiResponse | { message?: string } | null;
    if (!res.ok) {
      const msg = (json as { message?: string } | null)?.message;
      setError(msg ?? "Gagal load data");
      setLoading(false);
      return;
    }
    setData(json as ApiResponse);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const colW = 70;
  const laneH = 28;

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ unitName: string; block: BookingBlock } | null>(null);

  const units = data?.units ?? [];

  const prepared = useMemo(() => {
    return units.map((u) => {
      const raw = u.bookings
        .map((b) => {
          const startIdx = Math.max(0, diffDaysISO(b.checkIn, start));
          const endIdx = Math.min(days, diffDaysISO(b.checkOut, start));
          return { b, startIdx, endIdx };
        })
        .filter((x) => x.endIdx > x.startIdx)
        .sort((a, b) => (a.startIdx !== b.startIdx ? a.startIdx - b.startIdx : b.endIdx - a.endIdx));

      const packed = lanePack(raw.map((x) => ({ startIdx: x.startIdx, endIdx: x.endIdx })));
      const blocks: PositionedBlock[] = raw.map((x, i) => ({
        ...x.b,
        startIdx: x.startIdx,
        endIdx: x.endIdx,
        lane: packed.laneFor[i],
      }));

      return { unit: u, blocks, laneCount: Math.max(1, packed.laneCount) };
    });
  }, [units, start, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Blocking Chart</h1>
          <p className="text-sm text-muted">Lihat booking sebagai blok (per unit). Klik blok untuk detail.</p>
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

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <div style={{ minWidth: 260 + dateCols.length * colW }}>
          <div className="grid" style={{ gridTemplateColumns: `260px repeat(${dateCols.length}, ${colW}px)` }}>
            <div className="sticky left-0 z-20 bg-background px-4 py-3 text-sm font-medium text-muted">Unit</div>
            {dateCols.map((d) => (
              <div
                key={d}
                className={`px-2 py-2 text-center text-[11px] font-medium text-muted ${isWeekendISO(d) ? "bg-background" : "bg-background"}`}
              >
                <div>{dayLabel(d)}</div>
                <div className="opacity-70">{d.slice(5)}</div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border">
            {prepared.map(({ unit, blocks, laneCount }) => {
              const rowH = laneCount * laneH + 12;
              return (
                <div key={unit.id} className="grid" style={{ gridTemplateColumns: `260px 1fr` }}>
                  <div className="sticky left-0 z-10 bg-surface px-4 py-3">
                    <div className={`font-medium text-foreground ${unit.isActive ? "" : "opacity-60"}`}>{unit.name}</div>
                    <div className="text-xs text-muted">
                      {unit.type}
                      {unit.category ? ` · ${unit.category}` : ""} · {unit.isActive ? "aktif" : "nonaktif"}
                    </div>
                  </div>

                  <div className="relative border-l border-border" style={{ height: rowH, width: dateCols.length * colW }}>
                    {dateCols.map((d, i) => (
                      <div
                        key={d}
                        className={`absolute top-0 h-full border-r border-border ${isWeekendISO(d) ? "bg-background" : ""}`}
                        style={{ left: i * colW, width: colW }}
                      />
                    ))}

                    {blocks.map((b) => {
                      const left = b.startIdx * colW + 6;
                      const width = Math.max(40, (b.endIdx - b.startIdx) * colW - 12);
                      const top = b.lane * laneH + 6;
                      const label = `${b.customerName}${b.quantity > 1 ? ` x${b.quantity}` : ""}`;
                      return (
                        <button
                          key={`${b.bookingId}-${b.startIdx}-${b.lane}`}
                          type="button"
                          onClick={() => {
                            setSelected({ unitName: unit.name, block: b });
                            setOpen(true);
                          }}
                          title={`${b.code} · ${b.customerName} · ${b.checkIn} - ${b.checkOut}`}
                          className={`absolute truncate rounded-full border px-3 py-1 text-left text-xs font-semibold shadow-sm hover:opacity-90 ${statusColor(b.status)}`}
                          style={{ left, top, width }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {prepared.length === 0 ? <div className="px-4 py-10 text-center text-sm text-muted">Tidak ada data</div> : null}
          </div>
        </div>
      </div>

      <Modal open={open} title="Detail Booking" onClose={() => setOpen(false)}>
        {selected ? (
          <div className="space-y-2 text-sm">
            <div className="text-sm font-semibold text-foreground">{selected.unitName}</div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="font-semibold text-foreground">{selected.block.customerName}</div>
              <div className="text-xs text-muted">{selected.block.phone}</div>
              <div className="mt-2 text-xs text-muted">
                <div>Kode: {selected.block.code}</div>
                <div>
                  Tanggal: {selected.block.checkIn} → {selected.block.checkOut}
                </div>
                <div>Qty: {selected.block.quantity}</div>
                <div>Status: {selected.block.status}</div>
              </div>
            </div>
            <div className="text-xs text-muted">Tip: gunakan Calendar View untuk lihat booking list per tanggal.</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

