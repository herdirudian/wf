import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";

export const dynamic = "force-dynamic";

function parseYmd(s: string | null | undefined) {
  const v = String(s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function sourceLabel(p: { gateway: string | null; method: string | null }) {
  if (p.gateway === "xendit_invoice") return "xendit";
  if ((p.method ?? "") === "rekening_perusahaan") return "rekening_perusahaan";
  if ((p.method ?? "") === "manual") return "manual";
  return p.gateway ? p.gateway : p.method ? p.method : "-";
}

export default async function PaymentsAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; source?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const now = new Date();
  const defaultFrom = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const from = parseYmd(sp.from) ? startOfDay(parseYmd(sp.from)!) : defaultFrom;
  const to = parseYmd(sp.to) ? endOfDay(parseYmd(sp.to)!) : endOfDay(now);
  const status = (sp.status ?? "").trim();
  const source = (sp.source ?? "").trim();

  const payments = await prisma.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(source
        ? source === "xendit"
          ? { gateway: "xendit_invoice" }
          : source === "rekening_perusahaan"
            ? { method: "rekening_perusahaan" }
            : source === "manual"
              ? { method: "manual" }
              : {}
        : {}),
      booking: { createdAt: { gte: from, lte: to } },
    },
    include: {
      booking: { include: { customer: true } },
    },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    take: 500,
  });

  const rows = payments.map((p) => {
    const baseTotal = p.amount ?? 0;
    const basePaid = p.paidAmount ?? 0;
    const feePaid = (p as any).serviceFeeAmount ?? 0;
    const grossPaid = basePaid + feePaid;
    const baseRemaining = Math.max(0, baseTotal - basePaid);
    const feeBps = (p as any).invoiceFeeBps ?? 0;
    const feeFlat = (p as any).invoiceFeeFlat ?? 0;
    const feeEstimateRemaining = baseRemaining > 0 ? Math.max(0, Math.round((baseRemaining * feeBps) / 10_000)) + Math.max(0, feeFlat) : 0;
    const grossRemainingEstimate = baseRemaining + feeEstimateRemaining;
    return {
      id: p.id,
      bookingCode: p.booking.code,
      createdAt: p.booking.createdAt,
      checkIn: p.booking.checkIn,
      customerName: p.booking.customer.name,
      bookingStatus: p.booking.status,
      paymentStatus: p.status,
      gateway: p.gateway,
      method: p.method,
      invoiceKind: (p as any).invoiceKind ?? null,
      invoiceBaseAmount: (p as any).invoiceBaseAmount ?? 0,
      invoiceFeeAmount: (p as any).invoiceFeeAmount ?? 0,
      baseTotal,
      basePaid,
      feePaid,
      grossPaid,
      baseRemaining,
      grossRemainingEstimate,
      source: sourceLabel({ gateway: p.gateway ?? null, method: p.method ?? null }),
    };
  });

  const sum = rows.reduce(
    (acc, r) => {
      acc.baseTotal += r.baseTotal;
      acc.basePaid += r.basePaid;
      acc.feePaid += r.feePaid;
      acc.grossPaid += r.grossPaid;
      return acc;
    },
    { baseTotal: 0, basePaid: 0, feePaid: 0, grossPaid: 0 },
  );

  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Audit Payment</h1>
          <p className="text-sm text-muted">Pisahkan base vs biaya layanan, gross paid, dan sumber pembayaran.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">From</div>
            <input name="from" defaultValue={fromStr} className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">To</div>
            <input name="to" defaultValue={toStr} className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Status</div>
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Semua</option>
              <option value="pending">pending</option>
              <option value="partial">partial</option>
              <option value="paid">paid</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Source</div>
            <select
              name="source"
              defaultValue={source}
              className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Semua</option>
              <option value="xendit">xendit</option>
              <option value="rekening_perusahaan">rekening_perusahaan</option>
              <option value="manual">manual</option>
            </select>
          </div>
          <button type="submit" className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Filter
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Base Total</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatIDR(sum.baseTotal)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Base Paid</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatIDR(sum.basePaid)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Fee Paid</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatIDR(sum.feePaid)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted">Gross Paid</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{formatIDR(sum.grossPaid)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Booking</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Check-In</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Base</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Gross</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Sisa (Est.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="text-foreground">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.bookingCode}</div>
                  <div className="text-xs text-muted">{formatDateWIB(r.createdAt)}</div>
                </td>
                <td className="px-4 py-3">{r.customerName}</td>
                <td className="px-4 py-3">{formatDateWIB(r.checkIn)}</td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">B: {r.bookingStatus}</div>
                  <div className="text-xs text-muted">P: {r.paymentStatus}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">{r.source}</div>
                  <div className="text-xs text-muted">{r.method ?? "-"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">Total {formatIDR(r.baseTotal)}</div>
                  <div className="text-xs text-muted">Paid {formatIDR(r.basePaid)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">Paid {formatIDR(r.feePaid)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">Paid {formatIDR(r.grossPaid)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-muted">{r.invoiceKind ?? "-"}</div>
                  <div className="text-xs text-muted">
                    {r.invoiceBaseAmount > 0 || r.invoiceFeeAmount > 0 ? `${formatIDR(r.invoiceBaseAmount)} + ${formatIDR(r.invoiceFeeAmount)}` : "-"}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{formatIDR(r.grossRemainingEstimate)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={10}>
                  Belum ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

