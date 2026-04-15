import { formatIDR, formatPct } from "@/lib/format";
import { getDashboardMetrics } from "@/services/report.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DashboardPage() {
  const m = await getDashboardMetrics();
  const max = Math.max(1, ...m.bookingsLast7Days.map((x) => x.count));

  const pendingPayments = await prisma.booking.count({
    where: {
      status: { not: "cancelled" },
      payment: { status: { not: "paid" } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted">Ringkasan operasional hari ini.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/dashboard/export?resource=dashboard"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
          >
            Export CSV
          </a>
          {pendingPayments > 0 && (
            <Link
              href="/dashboard/bookings/monitoring"
              className="flex items-center gap-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-700 border border-yellow-500/20 hover:bg-yellow-500/20"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
              {pendingPayments} Booking perlu follow up
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm text-muted">Booking check-in hari ini</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{m.bookingToday}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm text-muted">Revenue hari ini</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{formatIDR(m.revenueToday)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm text-muted">Occupancy rate</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{formatPct(m.occupancyRate)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-sm font-semibold text-foreground">Booking 7 hari terakhir</div>
        <div className="mt-3 grid grid-cols-7 gap-2 items-end">
          {m.bookingsLast7Days.map((x) => (
            <div key={x.date} className="flex flex-col items-center gap-2">
              <div className="w-full rounded-lg bg-background">
                <div
                  className="w-full rounded-lg bg-primary"
                  style={{ height: `${Math.round((x.count / max) * 120)}px` }}
                  title={`${x.date}: ${x.count}`}
                />
              </div>
              <div className="text-[11px] text-muted">{x.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

