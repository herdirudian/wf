import { getReports } from "@/services/report.service";
import { formatIDR } from "@/lib/format";

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

