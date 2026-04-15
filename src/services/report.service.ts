import { prisma } from "@/lib/prisma";

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

export async function getDashboardMetrics() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [bookingToday, revenueToday, totalInventory] = await Promise.all([
    prisma.booking.count({
      where: { checkIn: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.payment.aggregate({
      where: { status: "paid", paidAt: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
    }),
    prisma.unit.aggregate({
      _sum: { totalUnits: true },
    }),
  ]);

  const overlappingItems = await prisma.bookingItem.findMany({
    where: {
      booking: {
        status: { not: "cancelled" },
        checkIn: { lt: todayEnd },
        checkOut: { gt: todayStart },
      },
    },
    select: { quantity: true },
  });

  const bookedQty = overlappingItems.reduce((acc, x) => acc + x.quantity, 0);
  const inventory = totalInventory._sum.totalUnits ?? 0;
  const occupancyRate = inventory > 0 ? bookedQty / inventory : 0;

  const series: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const s = startOfDay(d);
    const e = endOfDay(d);
    const count = await prisma.booking.count({ where: { createdAt: { gte: s, lte: e } } });
    series.push({ date: s.toISOString().slice(0, 10), count });
  }

  return {
    bookingToday,
    revenueToday: revenueToday._sum.amount ?? 0,
    occupancyRate,
    bookingsLast7Days: series,
  };
}

export async function getReports() {
  const monthlyRevenue = (await prisma.$queryRaw<
    Array<{ ym: string; revenue: bigint | number | null }>
  >`
    SELECT DATE_FORMAT(paidAt, '%Y-%m') AS ym, SUM(amount) AS revenue
    FROM Payment
    WHERE status = 'paid' AND paidAt IS NOT NULL
    GROUP BY ym
    ORDER BY ym ASC
  `).map((r) => ({ ym: r.ym, revenue: Number(r.revenue ?? 0) }));

  const bookingCount = (await prisma.$queryRaw<
    Array<{ ym: string; cnt: bigint | number | null }>
  >`
    SELECT DATE_FORMAT(checkIn, '%Y-%m') AS ym, COUNT(*) AS cnt
    FROM Booking
    WHERE status <> 'cancelled'
    GROUP BY ym
    ORDER BY ym ASC
  `).map((r) => ({ ym: r.ym, count: Number(r.cnt ?? 0) }));

  const topUnits = (await prisma.$queryRaw<
    Array<{ unitId: string; name: string; qty: bigint | number | null }>
  >`
    SELECT u.id AS unitId, u.name AS name, SUM(bi.quantity) AS qty
    FROM BookingItem bi
    JOIN Booking b ON b.id = bi.bookingId
    JOIN Unit u ON u.id = bi.unitId
    WHERE b.status IN ('paid', 'completed')
    GROUP BY u.id, u.name
    ORDER BY qty DESC
    LIMIT 10
  `).map((r) => ({ unitId: r.unitId, name: r.name, quantity: Number(r.qty ?? 0) }));

  return { monthlyRevenue, bookingCount, topUnits };
}

