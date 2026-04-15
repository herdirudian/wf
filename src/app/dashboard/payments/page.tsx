import { listPayments, type PaymentStatus } from "@/services/payment.service";
import { Pagination } from "@/components/ui/Pagination";
import { PaymentManager, type PaymentRow } from "@/components/payments/PaymentManager";
import { requireAdmin } from "@/lib/auth";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.pageSize ?? "10") || 10));
  const status = typeof sp.status === "string" ? (sp.status as PaymentStatus) : undefined;

  const data = await listPayments({ page, pageSize, status });

  const rows: PaymentRow[] = data.items.map((p) => ({
    id: p.id,
    bookingCode: p.booking.code,
    customerName: p.booking.customer.name,
    amount: p.amount,
    paidAmount: p.paidAmount,
    serviceFeeAmount: p.serviceFeeAmount ?? 0,
    status: p.status as PaymentStatus,
    method: p.method ?? "-",
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Payment</h1>
          <p className="text-sm text-muted">Monitoring payment dan update manual.</p>
        </div>
        <a
          href={`/api/dashboard/export?resource=payments&status=${encodeURIComponent(status ?? "")}`}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      <form className="flex items-end gap-3" method="get">
        <div>
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Semua</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <PaymentManager rows={rows} currentUserRole={role} />

      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}

