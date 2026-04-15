import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FrontOfficeManager } from "@/components/reception/FrontOfficeManager";
import { addDaysWIB, formatDateWIB, parseDateWIB } from "@/lib/time";

export const dynamic = "force-dynamic";

function safeParseYmd(input: string | null | undefined) {
  const s = String(input ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  try {
    return parseDateWIB(s);
  } catch {
    return null;
  }
}

export default async function FrontOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const adminUser = await requireAdmin();
  const sp = await searchParams;

  const now = new Date();
  const selected = safeParseYmd(sp.date);
  const dateFilterStr = selected ? formatDateWIB(selected) : "";
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dayStart = selected ?? null;
  const dayEnd = selected ? addDaysWIB(selected, 1) : null;

  const [cfg, bookings, dayBookings] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: 1 }, select: { kavlingSellCount: true } }),
    prisma.booking.findMany({
      where: {
        status: { not: "cancelled" },
        ...(dayStart && dayEnd
          ? { checkIn: { gte: dayStart, lt: dayEnd } }
          : { checkIn: { lte: until }, checkOut: { gte: since } }),
        payment: { status: { in: ["paid", "partial"] } },
      },
      orderBy: [{ checkIn: "asc" }, { code: "asc" }],
      include: {
        customer: true,
        payment: true,
        kavlings: { include: { kavling: true } },
        items: { include: { unit: true } },
      },
      take: 1000,
    }),
    dayStart && dayEnd
      ? prisma.booking.findMany({
          where: {
            status: { not: "cancelled" },
            checkIn: { lt: dayEnd },
            checkOut: { gt: dayStart },
            payment: { status: { in: ["paid", "partial"] } },
          },
          include: { kavlings: { include: { kavling: true } } },
          take: 2000,
        })
      : Promise.resolve([]),
  ]);

  const sellCount = Math.max(1, Math.min(110, cfg?.kavlingSellCount ?? 110));
  const allKavlings = Array.from({ length: sellCount }, (_, i) => i + 1);

  const kavlingStatusByNumber = (() => {
    const m = new Map<number, "booked" | "checked_in" | "checked_out">();
    for (const b of dayBookings) {
      const st = String((b as any).status ?? "");
      const kind = st === "completed" || (b as any).checkedOutAt ? "checked_out" : st === "checked_in" || (b as any).checkedInAt ? "checked_in" : "booked";
      for (const r of b.kavlings) {
        const n = r.kavling.number;
        const prev = m.get(n);
        if (prev === "checked_out") continue;
        if (prev === "checked_in" && kind !== "checked_out") continue;
        if (prev === "booked" && kind === "booked") continue;
        m.set(n, kind);
      }
    }
    const out: Record<number, "booked" | "checked_in" | "checked_out"> = {};
    for (const [n, st] of Array.from(m.entries()).sort((a, b) => a[0] - b[0])) {
      out[n] = st;
    }
    return out;
  })();

  const rows = bookings.map((b) => ({
    id: b.id,
    code: b.code,
    status: b.status,
    checkIn: b.checkIn.toISOString(),
    checkOut: b.checkOut.toISOString(),
    totalGuest: b.totalGuest,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
    checkedOutAt: b.checkedOutAt ? b.checkedOutAt.toISOString() : null,
    customer: { name: b.customer.name, phone: b.customer.phone, email: b.customer.email ?? null },
    payment: b.payment
      ? {
          status: b.payment.status,
          amount: b.payment.amount,
          paidAmount: b.payment.paidAmount,
          serviceFeeAmount: b.payment.serviceFeeAmount,
          method: b.payment.method ?? null,
        }
      : null,
    kavlings: b.kavlings.map((x) => x.kavling.number).sort((a, c) => a - c),
    items: b.items.map((x) => ({ name: x.unit.name, quantity: x.quantity })),
  }));

  return (
    <FrontOfficeManager
      rows={rows}
      currentUserRole={adminUser.role ?? "administrator"}
      initialCheckInDate={dateFilterStr}
      kavlingBoard={dateFilterStr ? { numbers: allKavlings, statusByNumber: kavlingStatusByNumber } : null}
    />
  );
}
