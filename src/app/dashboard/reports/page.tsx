import { getReports } from "@/services/report.service";
import { formatIDR } from "@/lib/format";
import Link from "next/link";

export default async function ReportsPage() {
  const r = await getReports();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted">Ringkasan revenue, booking count, dan unit terlaris.</p>
        </div>
        <a
          href="/api/dashboard/export?resource=reports"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      {/* Sub-menu Reports Baru */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link 
          href="/dashboard/reports/arrivals" 
          className="group flex flex-col gap-1 rounded-2xl border border-border bg-surface p-6 transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 group-hover:bg-emerald-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="text-base font-bold text-foreground">Arrival List</div>
          </div>
          <p className="mt-2 text-xs text-muted">Daftar tamu yang dijadwalkan tiba (check-in).</p>
        </Link>

        <Link 
          href="/dashboard/reports/departures" 
          className="group flex flex-col gap-1 rounded-2xl border border-border bg-surface p-6 transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 group-hover:bg-amber-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="text-base font-bold text-foreground">Departure List</div>
          </div>
          <p className="mt-2 text-xs text-muted">Daftar tamu yang dijadwalkan pulang (check-out).</p>
        </Link>

        <Link 
          href="/dashboard/reports/in-house" 
          className="group flex flex-col gap-1 rounded-2xl border border-border bg-surface p-6 transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600 group-hover:bg-blue-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="text-base font-bold text-foreground">Guest In-House</div>
          </div>
          <p className="mt-2 text-xs text-muted">Daftar tamu yang sedang menginap di lokasi.</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Revenue Bulanan</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Bulan</th>
                  <th className="py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {r.monthlyRevenue.map((x) => (
                  <tr key={x.ym} className="border-t border-border">
                    <td className="py-2 pr-3">{x.ym}</td>
                    <td className="py-2">{formatIDR(x.revenue)}</td>
                  </tr>
                ))}
                {r.monthlyRevenue.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="py-4 text-center text-muted" colSpan={2}>
                      Belum ada data
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Booking Count</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Bulan</th>
                  <th className="py-2 font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {r.bookingCount.map((x) => (
                  <tr key={x.ym} className="border-t border-border">
                    <td className="py-2 pr-3">{x.ym}</td>
                    <td className="py-2">{x.count}</td>
                  </tr>
                ))}
                {r.bookingCount.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="py-4 text-center text-muted" colSpan={2}>
                      Belum ada data
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Unit Terlaris</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {r.topUnits.map((x) => (
                  <tr key={x.unitId} className="border-t border-border">
                    <td className="py-2 pr-3">{x.name}</td>
                    <td className="py-2">{x.quantity}</td>
                  </tr>
                ))}
                {r.topUnits.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="py-4 text-center text-muted" colSpan={2}>
                      Belum ada data
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

