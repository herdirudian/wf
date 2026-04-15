"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/format";

export type BookingStatus = "pending" | "paid" | "checked_in" | "cancelled" | "completed";

export type BookingRow = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  totalGuest: number;
  status: BookingStatus;
  items: string;
  paymentStatus: string;
  paymentAmount: number;
  paymentPaidAmount: number;
  specialRequest: string | null;
  kavlings: Array<{ unitId: string; unitName: string; scope: "paket" | "mandiri" | "private"; required: number; assigned: number[] }>;
};

function isoDate(iso: string) {
  return iso.slice(0, 10);
}

function allowedNext(status: BookingStatus) {
  if (status === "pending") return ["cancelled"] as BookingStatus[];
  if (status === "paid") return ["checked_in", "completed", "cancelled"] as BookingStatus[];
  if (status === "checked_in") return ["completed", "cancelled"] as BookingStatus[];
  return [] as BookingStatus[];
}

export function BookingManager({ rows, currentUserRole }: { rows: BookingRow[]; currentUserRole?: string }) {
  const isOwner = currentUserRole === "owner";
  const isAdministrator = currentUserRole === "administrator";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<BookingRow | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [rescheduleKavlings, setRescheduleKavlings] = useState<Record<string, number[]>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BookingRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const title = useMemo(() => (target ? `Reschedule: ${target.code}` : "Reschedule"), [target]);
  const [kavlingOpen, setKavlingOpen] = useState(false);
  const [kavlingMode, setKavlingMode] = useState<"edit" | "reschedule">("edit");
  const [kavlingTarget, setKavlingTarget] = useState<
    null | { bookingId: string; code: string; unitId: string; unitName: string; scope: "paket" | "mandiri" | "private"; required: number }
  >(
    null,
  );
  const [kavlingAll, setKavlingAll] = useState<number[]>([]);
  const [kavlingTaken, setKavlingTaken] = useState<Record<number, boolean>>({});
  const [kavlingTakenBy, setKavlingTakenBy] = useState<Record<number, string>>({});
  const [kavlingSelected, setKavlingSelected] = useState<number[]>([]);
  const [kavlingRequired, setKavlingRequired] = useState(0);
  const [kavlingLoading, setKavlingLoading] = useState(false);
  const [kavlingError, setKavlingError] = useState<string | null>(null);

  const kavlingTitle = useMemo(
    () => (kavlingTarget ? `Pilih Kavling: ${kavlingTarget.code} (${kavlingTarget.unitName})` : "Pilih Kavling"),
    [kavlingTarget],
  );

  function openReschedule(b: BookingRow) {
    setTarget(b);
    setCheckIn(isoDate(b.checkIn));
    setCheckOut(isoDate(b.checkOut));
    setError(null);
    setRescheduleKavlings(
      b.kavlings.reduce<Record<string, number[]>>((acc, k) => {
        acc[k.unitId] = (k.assigned ?? []).slice().sort((a, c) => a - c);
        return acc;
      }, {}),
    );
    setOpen(true);
  }

  function openDelete(b: BookingRow) {
    if (!isAdministrator) return;
    setDeleteTarget(b);
    setDeleteConfirm("");
    setDeleteOpen(true);
  }

  async function deleteBooking() {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== deleteTarget.code) return;
    setDeleting(true);
    try {
      const url = new URL("/api/bookings", window.location.origin);
      url.searchParams.set("id", deleteTarget.id);
      const res = await fetch(url.toString(), { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal menghapus booking");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirm("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus booking");
    } finally {
      setDeleting(false);
    }
  }

  async function updateStatus(id: string, status: BookingStatus) {
    const res = await fetch(`/api/bookings/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal update status");
      return;
    }
    router.refresh();
  }

  async function payWithXendit(b: BookingRow, mode: "dp" | "balance") {
    setPaying(b.id);
    try {
      const res = await fetch(`/api/public/bookings/${b.code}/pay?mode=${mode}`, { method: "POST" });
      const data = (await res.json()) as { invoiceUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message || "Gagal membuat invoice");
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memproses pembayaran");
    } finally {
      setPaying(null);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setSubmitting(true);
    setError(null);

    for (const k of target.kavlings) {
      const selected = rescheduleKavlings[k.unitId] ?? k.assigned ?? [];
      if ((k.assigned?.length ?? 0) > 0 && selected.length !== k.required) {
        setError(`Kavling untuk "${k.unitName}" harus ${k.required}`);
        setSubmitting(false);
        return;
      }
    }

    const kavlingsByUnit = Object.fromEntries(
      target.kavlings
        .map((k) => [k.unitId, (rescheduleKavlings[k.unitId] ?? k.assigned ?? []).slice().sort((a, c) => a - c)] as const)
        .filter(([, nums]) => nums.length > 0),
    );

    const res = await fetch(`/api/bookings/${target.id}/reschedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkIn, checkOut, kavlingsByUnit }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "Gagal reschedule");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  async function openKavling(b: BookingRow, k: BookingRow["kavlings"][number]) {
    setKavlingMode("edit");
    setKavlingTarget({ bookingId: b.id, code: b.code, unitId: k.unitId, unitName: k.unitName, required: k.required, scope: k.scope });
    setKavlingOpen(true);
    setKavlingLoading(true);
    setKavlingError(null);
    setKavlingAll([]);
    setKavlingTaken({});
    setKavlingTakenBy({});
    setKavlingSelected([]);
    setKavlingRequired(k.required);

    const url = new URL(`/api/bookings/${b.id}/kavlings`, window.location.origin);
    url.searchParams.set("unitId", k.unitId);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as
      | { required?: number; assigned?: number[]; taken?: number[]; takenBy?: Record<string, string>; all?: number[]; message?: string }
      | null;
    if (!res.ok) {
      setKavlingError(data?.message ?? "Gagal load kavling");
      setKavlingLoading(false);
      return;
    }
    const all = data?.all ?? Array.from({ length: 110 }).map((_, i) => i + 1);
    const taken = (data?.taken ?? []).reduce<Record<number, boolean>>((acc, n) => {
      acc[n] = true;
      return acc;
    }, {});
    setKavlingAll(all);
    setKavlingTaken(taken);
    const takenBy = Object.entries(data?.takenBy ?? {}).reduce<Record<number, string>>((acc, [k, v]) => {
      const n = Number(k);
      if (Number.isFinite(n)) acc[n] = v;
      return acc;
    }, {});
    setKavlingTakenBy(takenBy);
    setKavlingSelected((data?.assigned ?? []).slice().sort((a, b) => a - b));
    setKavlingRequired(data?.required ?? k.required);
    setKavlingLoading(false);
  }

  async function openKavlingReschedule(k: BookingRow["kavlings"][number]) {
    if (!target) return;
    setKavlingMode("reschedule");
    setKavlingTarget({ bookingId: target.id, code: target.code, unitId: k.unitId, unitName: k.unitName, required: k.required, scope: k.scope });
    setKavlingOpen(true);
    setKavlingLoading(true);
    setKavlingError(null);
    setKavlingAll([]);
    setKavlingTaken({});
    setKavlingTakenBy({});
    setKavlingSelected([]);
    setKavlingRequired(k.required);

    const url = new URL(`/api/bookings/${target.id}/kavlings`, window.location.origin);
    url.searchParams.set("unitId", k.unitId);
    url.searchParams.set("checkIn", checkIn);
    url.searchParams.set("checkOut", checkOut);
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as
      | { required?: number; assigned?: number[]; taken?: number[]; takenBy?: Record<string, string>; all?: number[]; message?: string }
      | null;
    if (!res.ok) {
      setKavlingError(data?.message ?? "Gagal load kavling");
      setKavlingLoading(false);
      return;
    }
    const all = data?.all ?? Array.from({ length: 110 }).map((_, i) => i + 1);
    const taken = (data?.taken ?? []).reduce<Record<number, boolean>>((acc, n) => {
      acc[n] = true;
      return acc;
    }, {});
    setKavlingAll(all);
    setKavlingTaken(taken);
    const takenBy = Object.entries(data?.takenBy ?? {}).reduce<Record<number, string>>((acc, [k, v]) => {
      const n = Number(k);
      if (Number.isFinite(n)) acc[n] = v;
      return acc;
    }, {});
    setKavlingTakenBy(takenBy);
    const selectedBase = (rescheduleKavlings[k.unitId] ?? k.assigned ?? []).slice().sort((a, b) => a - b);
    setKavlingSelected(selectedBase);
    setKavlingRequired(data?.required ?? k.required);
    setKavlingLoading(false);
  }

  function toggleKavling(n: number) {
    setKavlingSelected((s) => {
      const exists = s.includes(n);
      if (exists) return s.filter((x) => x !== n);
      if (!!kavlingTaken[n]) return s;
      if (s.length >= kavlingRequired) return s;
      return [...s, n].sort((a, b) => a - b);
    });
  }

  async function saveKavling() {
    if (!kavlingTarget) return;
    if (kavlingSelected.length !== kavlingRequired) {
      setKavlingError(`Jumlah kavling harus ${kavlingRequired}`);
      return;
    }
    if (kavlingMode === "reschedule") {
      setRescheduleKavlings((s) => ({ ...s, [kavlingTarget.unitId]: kavlingSelected.slice().sort((a, b) => a - b) }));
      setKavlingOpen(false);
      return;
    }
    setKavlingLoading(true);
    setKavlingError(null);
    const res = await fetch(`/api/bookings/${kavlingTarget.bookingId}/kavlings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: kavlingTarget.unitId, numbers: kavlingSelected }),
    });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setKavlingError(data?.message ?? "Gagal simpan kavling");
      setKavlingLoading(false);
      return;
    }
    setKavlingLoading(false);
    setKavlingOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 sm:hidden">
        {rows.map((b) => {
          const options = allowedNext(b.status);
          const hasKav = b.kavlings.length > 0;
          return (
            <div key={b.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{b.code}</div>
                  <div className="mt-1 text-xs text-muted">
                    In: {isoDate(b.checkIn)} • Out: {isoDate(b.checkOut)} • Guest: {b.totalGuest}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted">{b.status}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground">Customer</div>
                  <div className="mt-1 text-sm text-foreground">{b.customerName}</div>
                  <div className="text-xs text-muted">{b.phone}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">Item</div>
                  <div className="mt-1 text-xs text-muted">{b.items}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">Payment</div>
                  <div className="mt-1 text-xs text-muted">{b.paymentStatus}</div>
                  <div className="text-xs text-muted">
                    {formatIDR(b.paymentPaidAmount)}/{formatIDR(b.paymentAmount)}
                  </div>
                  {b.paymentStatus !== "paid" ? (
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        disabled={paying === b.id || b.paymentPaidAmount > 0 || isOwner}
                        onClick={() => payWithXendit(b, "dp")}
                        className="rounded-xl border border-border bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {paying === b.id ? "..." : "Bayar DP (Xendit)"}
                      </button>
                      <button
                        type="button"
                        disabled={paying === b.id || isOwner}
                        onClick={() => payWithXendit(b, "balance")}
                        className="rounded-xl border border-border bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {paying === b.id ? "..." : "Bayar Pelunasan (Xendit)"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">Kavling</div>
                  {hasKav ? (
                    <div className="mt-2 space-y-2">
                      {b.kavlings.map((k) => {
                        const assignedText = k.assigned.length ? k.assigned.join(", ") : "-";
                        const canEdit = b.status === "paid" || b.status === "checked_in" || b.status === "completed";
                        return (
                          <div key={k.unitId} className="rounded-xl border border-border bg-background px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold text-foreground">{k.unitName}</div>
                                <div className="mt-0.5 text-[11px] text-muted">
                                  {k.scope} • {k.assigned.length}/{k.required} • {assignedText}
                                </div>
                              </div>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => openKavling(b, k)}
                                  disabled={isOwner}
                                  className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs hover:bg-background"
                                >
                                  {k.assigned.length < k.required ? "Pilih" : "Ubah"}
                                </button>
                              ) : (
                                <div className="shrink-0 text-[11px] text-muted">Aktif setelah valid</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-muted">-</div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openReschedule(b)}
                  disabled={b.status === "cancelled" || isOwner}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                >
                  Reschedule
                </button>
                {options.length ? (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value as BookingStatus;
                      if (v) updateStatus(b.id, v);
                    }}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-semibold outline-none focus:border-primary"
                  >
                    <option value="">Update...</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div />
                )}
                {isAdministrator ? (
                  <button
                    type="button"
                    onClick={() => openDelete(b)}
                    className="col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Hapus
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">Belum ada data</div>
        ) : null}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-border sm:block">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Kavling</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.map((b) => {
              const options = allowedNext(b.status);
              const hasKav = b.kavlings.length > 0;
              return (
                <tr key={b.id} className="align-top text-foreground">
                  <td className="px-4 py-3 font-medium text-foreground">{b.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="font-medium">{b.customerName}</div>
                      {b.specialRequest && (
                        <div className="group relative">
                          <span className="cursor-help text-base leading-none" title={b.specialRequest}>
                            📝
                          </span>
                          <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg bg-slate-900 p-2 text-[11px] text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                            {b.specialRequest}
                            <div className="absolute top-full left-1/2 -mt-1 -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted">{b.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>In: {isoDate(b.checkIn)}</div>
                    <div>Out: {isoDate(b.checkOut)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{b.items}</td>
                  <td className="px-4 py-3">{b.totalGuest}</td>
                  <td className="px-4 py-3">
                    {hasKav ? (
                      <div className="space-y-2">
                        {b.kavlings.map((k) => {
                          const assignedText = k.assigned.length ? k.assigned.join(", ") : "-";
                          const canEdit = b.status === "paid" || b.status === "checked_in" || b.status === "completed";
                          return (
                            <div key={k.unitId} className="rounded-xl border border-border bg-background px-2 py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-xs font-medium text-foreground">{k.unitName}</div>
                                  <div className="text-[11px] text-muted">
                                    {k.scope} • {k.assigned.length}/{k.required} • {assignedText}
                                  </div>
                                </div>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => openKavling(b, k)}
                                    disabled={isOwner}
                                    className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs hover:bg-background"
                                  >
                                    {k.assigned.length < k.required ? "Pilih" : "Ubah"}
                                  </button>
                                ) : (
                                  <div className="shrink-0 text-[11px] text-muted">Aktif setelah valid</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted">-</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted">{b.status}</div>
                    {options.length ? (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value as BookingStatus;
                          if (v) updateStatus(b.id, v);
                        }}
                        className="mt-2 w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
                      >
                        <option value="">Update...</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    <div>{b.paymentStatus}</div>
                    <div className="text-muted">
                      {formatIDR(b.paymentPaidAmount)}/{formatIDR(b.paymentAmount)}
                    </div>
                    {b.paymentStatus !== "paid" ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={paying === b.id || b.paymentPaidAmount > 0 || isOwner}
                          onClick={() => payWithXendit(b, "dp")}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {paying === b.id ? "..." : "Bayar DP (Xendit)"}
                        </button>
                        <button
                          type="button"
                          disabled={paying === b.id || isOwner}
                          onClick={() => payWithXendit(b, "balance")}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {paying === b.id ? "..." : "Bayar Pelunasan (Xendit)"}
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => openReschedule(b)}
                        disabled={b.status === "cancelled" || isOwner}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs hover:bg-background disabled:opacity-50"
                      >
                        Reschedule
                      </button>
                      {isAdministrator ? (
                        <button
                          type="button"
                          onClick={() => openDelete(b)}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={9}>
                  Belum ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Check-in</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Check-out</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {target?.kavlings?.length ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold text-foreground">Kavling</div>
              <div className="mt-3 space-y-2">
                {target.kavlings.map((k) => {
                  const selected = rescheduleKavlings[k.unitId] ?? k.assigned ?? [];
                  const selectedText = selected.length ? selected.join(", ") : "-";
                  return (
                    <div key={k.unitId} className="rounded-xl border border-border bg-background px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{k.unitName}</div>
                          <div className="mt-1 text-xs text-muted">
                            {k.scope} • {selected.length}/{k.required} • {selectedText}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openKavlingReschedule(k)}
                          className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground hover:bg-background"
                        >
                          {selected.length < k.required ? "Pilih" : "Ubah"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted">Kavling dicek berdasarkan tanggal baru (check-in/check-out).</div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={kavlingOpen} title={kavlingTitle} onClose={() => setKavlingOpen(false)}>
        <div className="space-y-3">
          <div className="space-y-1 text-sm text-muted">
            {kavlingTarget ? (
              <div>
                {kavlingTarget.unitName} • {kavlingTarget.scope} • x{kavlingRequired}
              </div>
            ) : null}
            <div>
              Pilih {kavlingRequired} kavling. Terpilih: {kavlingSelected.length}/{kavlingRequired}
            </div>
          </div>
          {kavlingError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{kavlingError}</div>
          ) : null}
          {kavlingLoading ? <div className="text-sm text-muted">Loading...</div> : null}
          <div className="max-h-[55dvh] overflow-auto rounded-2xl border border-border p-3">
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
              {kavlingAll.map((n) => {
                const selected = kavlingSelected.includes(n);
                const taken = !!kavlingTaken[n];
                const blocked = taken && !selected;
                const takenLabel = kavlingTakenBy[n];
                return (
                  <button
                    key={n}
                    type="button"
                    title={blocked ? (takenLabel ? `Terpakai: ${takenLabel}` : "Terpakai") : ""}
                    onClick={() => toggleKavling(n)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                      selected
                        ? "border-accent bg-accent/20 text-foreground"
                        : blocked
                          ? "border-border bg-background text-muted opacity-60"
                          : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setKavlingOpen(false)}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={kavlingLoading || kavlingSelected.length !== kavlingRequired}
              onClick={saveKavling}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Simpan
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title={deleteTarget ? `Hapus Booking: ${deleteTarget.code}` : "Hapus Booking"}
        onClose={() => {
          if (deleting) return;
          setDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteConfirm("");
        }}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Menghapus booking akan menghapus data pembayaran/transaksi yang terhubung. Aksi ini tidak bisa dibatalkan.
          </div>
          {deleteTarget ? (
            <div className="text-sm text-muted">
              Ketik kode booking <span className="font-semibold text-foreground">{deleteTarget.code}</span> untuk konfirmasi.
            </div>
          ) : null}
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            disabled={deleting}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (deleting) return;
                setDeleteOpen(false);
                setDeleteTarget(null);
                setDeleteConfirm("");
              }}
              disabled={deleting}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={deleteBooking}
              disabled={deleting || !deleteTarget || deleteConfirm.trim() !== deleteTarget.code}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Menghapus..." : "Hapus Booking"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

