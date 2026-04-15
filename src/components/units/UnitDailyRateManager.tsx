"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIDR } from "@/lib/format";

type RateRow = { date: string; price: number; allotment: number };

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

function formatDayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = months[d.getMonth()];
  return `${dayName} ${dd} ${mm}`;
}

export function UnitDailyRateManager({
  unitId,
  defaultWeekday,
  defaultWeekend,
  defaultAllotment,
  initialStart,
  initialEnd,
  initialItems,
}: {
  unitId: string;
  defaultWeekday: number;
  defaultWeekend: number;
  defaultAllotment: number;
  initialStart: string;
  initialEnd: string;
  initialItems: RateRow[];
}) {
  const router = useRouter();
  const [start, setStart] = useState(initialStart || startOfTodayISO());
  const [end, setEnd] = useState(initialEnd || startOfTodayISO());
  const [weekday, setWeekday] = useState(defaultWeekday);
  const [weekend, setWeekend] = useState(defaultWeekend);
  const [allotment, setAllotment] = useState(defaultAllotment);
  const [overwrite, setOverwrite] = useState(false);

  const [specialDate, setSpecialDate] = useState(startOfTodayISO());
  const [specialPrice, setSpecialPrice] = useState<number | "">("");
  const [specialAllotment, setSpecialAllotment] = useState<number | "">("");

  const [adjustStart, setAdjustStart] = useState(initialStart || startOfTodayISO());
  const [adjustEnd, setAdjustEnd] = useState(initialEnd || startOfTodayISO());
  const [adjustPercent, setAdjustPercent] = useState<10 | -10>(10);

  const [items, setItems] = useState<RateRow[]>(initialItems);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDate = useMemo(() => new Map(items.map((x) => [x.date, x])), [items]);

  const [calendarDays, setCalendarDays] = useState<7 | 14 | 30>(14);
  const [selectedDates, setSelectedDates] = useState<Record<string, boolean>>({});
  const [dirtyDates, setDirtyDates] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, { price: number; allotment: number }>>({});
  const [bulkPrice, setBulkPrice] = useState<number | "">("");
  const [bulkAllotment, setBulkAllotment] = useState<number | "">("");

  async function refreshRange(params?: { start: string; end: string }) {
    const url = new URL(`/api/units/${unitId}/daily-rate`, window.location.origin);
    url.searchParams.set("start", params?.start ?? start);
    url.searchParams.set("end", params?.end ?? end);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as { items?: RateRow[]; message?: string } | null;
    if (!res.ok) throw new Error(data?.message ?? "Gagal load data");
    setItems(data?.items ?? []);
  }

  async function generate(params?: { start: string; end: string }) {
    setSubmitting(true);
    setError(null);
    const rangeStart = params?.start ?? start;
    const rangeEnd = params?.end ?? end;
    const res = await fetch(`/api/units/${unitId}/daily-rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        start: rangeStart,
        end: rangeEnd,
        priceWeekday: Number(weekday),
        priceWeekend: Number(weekend),
        allotment: Number(allotment),
        overwrite,
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal generate");
      setSubmitting(false);
      return;
    }
    try {
      await refreshRange({ start: rangeStart, end: rangeEnd });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal refresh");
    }
    setSubmitting(false);
  }

  async function generateNext3Months() {
    const s = startOfTodayISO();
    const e = addDaysISO(s, 90);
    setStart(s);
    setEnd(e);
    setAdjustStart(s);
    setAdjustEnd(e);
    await generate({ start: s, end: e });
  }

  async function setSpecial() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/units/${unitId}/daily-rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "set",
        entries: [
          {
            date: specialDate,
            price: specialPrice === "" ? undefined : Number(specialPrice),
            allotment: specialAllotment === "" ? undefined : Number(specialAllotment),
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal set tanggal khusus");
      setSubmitting(false);
      return;
    }

    try {
      await refreshRange();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal refresh");
    }
    setSubmitting(false);
  }

  async function bulkAdjust() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/units/${unitId}/daily-rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "adjust",
        start: adjustStart,
        end: adjustEnd,
        percent: adjustPercent,
      }),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal adjust range");
      setSubmitting(false);
      return;
    }

    try {
      await refreshRange({ start: adjustStart, end: adjustEnd });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal refresh");
    }
    setSubmitting(false);
  }

  const calendarEnd = useMemo(() => addDaysISO(start, Math.max(0, calendarDays - 1)), [start, calendarDays]);

  const previewDates = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < calendarDays; i++) out.push(addDaysISO(start, i));
    return out;
  }, [start, calendarDays]);

  useEffect(() => {
    const next: Record<string, { price: number; allotment: number }> = {};
    for (const d of previewDates) {
      const r = byDate.get(d);
      next[d] = {
        price: r ? r.price : isWeekendISO(d) ? defaultWeekend : defaultWeekday,
        allotment: r ? r.allotment : defaultAllotment,
      };
    }
    setDraft(next);
    setDirtyDates({});
    setSelectedDates({});
    setBulkPrice("");
    setBulkAllotment("");
  }, [previewDates.join("|"), items.length, defaultAllotment, defaultWeekday, defaultWeekend]);

  async function saveDraft() {
    const entries = Object.keys(dirtyDates)
      .filter((k) => dirtyDates[k])
      .map((date) => ({
        date,
        price: draft[date]?.price ?? (isWeekendISO(date) ? defaultWeekend : defaultWeekday),
        allotment: draft[date]?.allotment ?? defaultAllotment,
      }));

    if (!entries.length) return;

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/units/${unitId}/daily-rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set", entries }),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setError(data?.message ?? "Gagal simpan perubahan");
      setSubmitting(false);
      return;
    }

    try {
      await refreshRange({ start, end: calendarEnd });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal refresh");
    }
    setSubmitting(false);
  }

  function applyBulk() {
    const dates = Object.keys(selectedDates).filter((k) => selectedDates[k]);
    if (!dates.length) return;
    setDraft((s) => {
      const next = { ...s };
      for (const d of dates) {
        const cur = next[d] ?? { price: isWeekendISO(d) ? defaultWeekend : defaultWeekday, allotment: defaultAllotment };
        next[d] = {
          price: bulkPrice === "" ? cur.price : Number(bulkPrice),
          allotment: bulkAllotment === "" ? cur.allotment : Number(bulkAllotment),
        };
      }
      return next;
    });
    setDirtyDates((s) => {
      const next = { ...s };
      for (const d of dates) next[d] = true;
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-sm font-semibold text-foreground">Cara Paling Mudah</div>
        <div className="mt-2 text-sm text-muted">
          Default harga & stok mengikuti Unit. Gunakan tanggal khusus untuk hari tertentu, atau bulk adjust untuk high season.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Calendar Editor</div>
            <div className="mt-1 text-sm text-muted">Edit harga & allotment langsung per tanggal, lalu simpan.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Start</label>
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  const v = e.target.value;
                  setStart(v);
                  setEnd(addDaysISO(v, Math.max(0, calendarDays - 1)));
                }}
                className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted">Days</label>
              <select
                value={calendarDays}
                onChange={(e) => {
                  const v = Number(e.target.value) as 7 | 14 | 30;
                  setCalendarDays(v);
                  setEnd(addDaysISO(start, Math.max(0, v - 1)));
                }}
                className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              >
                <option value={7}>7</option>
                <option value={14}>14</option>
                <option value={30}>30</option>
              </select>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setEnd(calendarEnd);
                try {
                  await refreshRange({ start, end: calendarEnd });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Gagal load data");
                }
              }}
              className="h-9 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
            >
              Load
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Bulk harga (optional)</label>
            <input
              type="number"
              min={0}
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Isi untuk set massal"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Bulk allotment (optional)</label>
            <input
              type="number"
              min={0}
              value={bulkAllotment}
              onChange={(e) => setBulkAllotment(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Isi untuk set massal"
            />
          </div>
          <div className="flex items-end justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={applyBulk}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
            >
              Apply ke tanggal terpilih
            </button>
            <button
              type="button"
              disabled={submitting || !Object.values(dirtyDates).some(Boolean)}
              onClick={saveDraft}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-max text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-background px-4 py-3 text-left font-medium">Type</th>
                {previewDates.map((d) => {
                  const weekend = isWeekendISO(d);
                  const selected = !!selectedDates[d];
                  return (
                    <th
                      key={d}
                      className={`px-3 py-2 text-center font-medium ${weekend ? "bg-background" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDates((s) => ({ ...s, [d]: !s[d] }))}
                        className={`w-full rounded-lg px-2 py-1 text-xs ${selected ? "bg-accent/20 text-foreground" : "hover:bg-surface"}`}
                      >
                        <div className="text-[11px]">{formatDayLabel(d)}</div>
                        <div className="text-[11px] opacity-70">{d.slice(5)}</div>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              <tr className="text-foreground">
                <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium">Allotment</td>
                {previewDates.map((d) => {
                  const isOverride = byDate.has(d);
                  const val = draft[d]?.allotment ?? defaultAllotment;
                  return (
                    <td key={d} className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setDraft((s) => ({ ...s, [d]: { ...(s[d] ?? { price: 0, allotment: 0 }), allotment: n } }));
                          setDirtyDates((s) => ({ ...s, [d]: true }));
                        }}
                        className={`w-24 rounded-lg border bg-surface px-2 py-1 text-sm outline-none focus:border-primary ${
                          isOverride ? "border-accent/60" : "border-border"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
              <tr className="text-foreground">
                <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium">Harga</td>
                {previewDates.map((d) => {
                  const isOverride = byDate.has(d);
                  const val = draft[d]?.price ?? (isWeekendISO(d) ? defaultWeekend : defaultWeekday);
                  return (
                    <td key={d} className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setDraft((s) => ({ ...s, [d]: { ...(s[d] ?? { price: 0, allotment: 0 }), price: n } }));
                          setDirtyDates((s) => ({ ...s, [d]: true }));
                        }}
                        className={`w-32 rounded-lg border bg-surface px-2 py-1 text-sm outline-none focus:border-primary ${
                          isOverride ? "border-accent/60" : "border-border"
                        }`}
                      />
                      <div className="mt-1 text-[11px] text-muted">{formatIDR(val)}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-muted">
          Tip: klik header tanggal untuk memilih, lalu Apply untuk set massal. Border input berwarna menandakan override.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-sm font-semibold text-foreground">Adjust Tanggal Khusus</div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Tanggal</label>
            <input
              type="date"
              value={specialDate}
              onChange={(e) => setSpecialDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Harga</label>
            <input
              type="number"
              min={0}
              value={specialPrice}
              onChange={(e) => setSpecialPrice(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Kosong = default"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Allotment</label>
            <input
              type="number"
              min={0}
              value={specialAllotment}
              onChange={(e) => setSpecialAllotment(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Kosong = default"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={submitting}
            onClick={setSpecial}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Memproses..." : "Simpan Tanggal"}
          </button>
        </div>
      </div>

      <details className="rounded-2xl border border-border bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Advanced Tools</summary>
        <div className="mt-4 space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Generate Harga & Allotment (Range)</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Start</label>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">End</label>
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Allotment / hari</label>
                <input
                  type="number"
                  min={0}
                  value={allotment}
                  onChange={(e) => setAllotment(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Harga Weekday</label>
                <input
                  type="number"
                  min={0}
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Harga Weekend</label>
                <input
                  type="number"
                  min={0}
                  value={weekend}
                  onChange={(e) => setWeekend(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Overwrite tanggal yang sudah ada
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={generateNext3Months}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                Generate 3 Bulan ke Depan
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => generate()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? "Memproses..." : "Generate"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold text-foreground">Bulk Adjust Harga (Range)</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Start</label>
                <input
                  type="date"
                  value={adjustStart}
                  onChange={(e) => setAdjustStart(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">End</label>
                <input
                  type="date"
                  value={adjustEnd}
                  onChange={(e) => setAdjustEnd(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Adjust</label>
                <select
                  value={adjustPercent}
                  onChange={(e) => setAdjustPercent(Number(e.target.value) as 10 | -10)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value={10}>+10%</option>
                  <option value={-10}>-10%</option>
                </select>
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={bulkAdjust}
                  className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? "Memproses..." : "Apply"}
                </button>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted">
              Bulk adjust akan membuat override untuk semua tanggal di range (berdasarkan harga efektif saat ini).
            </div>
          </div>
        </div>
      </details>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      <div className="rounded-2xl border border-border bg-surface p-5 text-xs text-muted">
        Default harga: weekday {formatIDR(defaultWeekday)} · weekend {formatIDR(defaultWeekend)} · default allotment {defaultAllotment}
      </div>
    </div>
  );
}
