import { listBookings, type BookingStatus } from "@/services/booking.service";
import { Pagination } from "@/components/ui/Pagination";
import { BookingManager, type BookingRow } from "@/components/bookings/BookingManager";
import Link from "next/link";
import { addDaysWIB, formatDateWIB, parseDateWIB } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.pageSize ?? "10") || 10));
  const status = typeof sp.status === "string" ? (sp.status as BookingStatus) : undefined;
  const startStr = typeof sp.start === "string" ? sp.start : undefined;
  const endStr = typeof sp.end === "string" ? sp.end : undefined;
  const start = startStr ? parseDateWIB(startStr) : undefined;
  const end = endStr ? addDaysWIB(parseDateWIB(endStr), 1) : undefined;

  const data = await listBookings({ page, pageSize, status, start, end });

  const rows: BookingRow[] = data.items.map((b) => {
    function scopeFromUnit(u: { kavlingScope?: string | null; category?: string | null; name: string }) {
      const scope = (u.kavlingScope ?? "").toLowerCase();
      if (scope === "paket" || scope === "mandiri" || scope === "private") return scope;
      const raw = (u.category ?? "").toLowerCase();
      const n = u.name.toLowerCase();
      if (raw.includes("private") || n.includes("private")) return "private";
      if (raw.includes("mandiri") || raw.includes("kavling") || n.includes("mandiri") || n.includes("kavling")) return "mandiri";
      if (raw.includes("paket") || n.startsWith("paket ")) return "paket";
      return null;
    }

    const byUnit = new Map<
      string,
      { unitId: string; unitName: string; scope: "paket" | "mandiri" | "private"; required: number; assigned: number[] }
    >();
    for (const it of b.items) {
      const u = it.unit as unknown as { kavlingScope?: string | null; category?: string | null; name: string };
      const scope = scopeFromUnit(u);
      if (!scope) continue;
      const prev = byUnit.get(it.unitId);
      if (prev) prev.required += it.quantity;
      else {
        byUnit.set(it.unitId, { unitId: it.unitId, unitName: (it.unit as unknown as { name: string }).name, scope: scope as never, required: it.quantity, assigned: [] });
      }
    }

    for (const kv of b.kavlings) {
      const item = byUnit.get(kv.unitId);
      if (!item) continue;
      item.assigned.push(kv.kavling.number);
    }
    const kavlings = Array.from(byUnit.values())
      .map((k) => ({ ...k, assigned: k.assigned.sort((a, b) => a - b) }))
      .sort((a, b) => {
        const w = (x: string) => (x === "private" ? 0 : x === "paket" ? 1 : 2);
        return w(a.scope) - w(b.scope) || a.unitName.localeCompare(b.unitName);
      });

    return {
      id: b.id,
      code: b.code,
      customerName: b.customer.name,
      phone: b.customer.phone,
      checkIn: formatDateWIB(b.checkIn),
      checkOut: formatDateWIB(b.checkOut),
      totalGuest: b.totalGuest,
      status: b.status as BookingStatus,
      items: b.items.map((x) => `${x.unit.name} x${x.quantity}`).join(", "),
      paymentStatus: (b.payment?.status ?? "-") as string,
      paymentAmount: b.payment?.amount ?? 0,
      paymentPaidAmount: b.payment?.paidAmount ?? 0,
      specialRequest: b.specialRequest,
      kavlings,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Booking</h1>
          <p className="text-sm text-muted">Kelola booking, status, dan reschedule.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <a
            href={`/api/dashboard/export?resource=bookings&status=${encodeURIComponent(status ?? "")}&start=${encodeURIComponent(startStr ?? "")}&end=${encodeURIComponent(endStr ?? "")}`}
            className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-background transition-all active:scale-95 shadow-sm sm:w-auto"
          >
            Export CSV
          </a>
          {role !== "owner" && (
            <Link
              href="/dashboard/bookings/new"
              className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-sm sm:w-auto"
            >
              Tambah Manual
            </Link>
          )}
          <Link
            href="/dashboard/bookings/calendar"
            className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-background transition-all active:scale-95 shadow-sm sm:w-auto"
          >
            Calendar View
          </Link>
          <Link
            href="/dashboard/bookings/chart"
            className="flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-background transition-all active:scale-95 shadow-sm sm:w-auto"
          >
            Blocking Chart
          </Link>
        </div>
      </div>

      <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end" method="get">
        <div>
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Semua</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="checked_in">Checked-in</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Start</label>
          <input
            type="date"
            name="start"
            defaultValue={startStr ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">End</label>
          <input
            type="date"
            name="end"
            defaultValue={endStr ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          className="flex min-h-[2.75rem] items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
        >
          Filter
        </button>
      </form>

      <BookingManager rows={rows} currentUserRole={role} />

      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}

