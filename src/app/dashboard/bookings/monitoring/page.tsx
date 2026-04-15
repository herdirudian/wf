import { prisma } from "@/lib/prisma";
import { BookingMonitoringManager, type MonitoringRow } from "@/components/bookings/BookingMonitoringManager";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BookingMonitoringPage() {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  const cfg = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null, holdMinutes: 5, balanceReminderDays: 7 },
    update: {},
  });
  const balanceDueDays = Math.max(0, cfg.balanceReminderDays ?? 7);
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      checkIn: { gte: since },
      payment: {
        status: { not: "paid" },
      },
    },
    orderBy: { checkIn: "asc" },
    include: {
      customer: true,
      payment: true,
    },
  });

  const rows: MonitoringRow[] = bookings.map((b) => ({
    id: b.id,
    code: b.code,
    customerName: b.customer.name,
    phone: b.customer.phone,
    email: b.customer.email,
    checkIn: b.checkIn,
    status: b.status,
    paymentStatus: b.payment?.status ?? "-",
    paymentAmount: b.payment?.amount ?? 0,
    paymentPaidAmount: b.payment?.paidAmount ?? 0,
    specialRequest: b.specialRequest,
    createdAt: b.createdAt,
    checkoutUrl: b.payment?.checkoutUrl ?? null,
    gatewayExternalId: b.payment?.gatewayExternalId ?? null,
    gatewayExpiresAt: b.payment?.gatewayExpiresAt ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Monitoring Pembayaran</h1>
          <p className="text-sm text-muted">
            Pantau booking yang belum lunas (DP/Pelunasan) untuk follow up ke tamu.
          </p>
        </div>
        <a
          href="/api/dashboard/export?resource=monitoring"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      <BookingMonitoringManager rows={rows} balanceDueDays={balanceDueDays} currentUserRole={role} />
    </div>
  );
}
