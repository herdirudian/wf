import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysWIB, formatDateWIB, nightDatesWIB, parseDateWIB, startOfDayWIB } from "@/lib/time";

const QuerySchema = z.object({
  start: z.string().min(1),
  days: z.coerce.number().int().min(1).max(60).default(14),
  type: z.enum(["tenda", "cabin"]).optional(),
  category: z.enum(["paket", "mandiri", "unit"]).optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    start: url.searchParams.get("start") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    includeInactive: url.searchParams.get("includeInactive") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });

  const start = (() => {
    try {
      return startOfDayWIB(parseDateWIB(parsed.data.start));
    } catch (e) {
      return e instanceof Error ? e : new Error("Query tidak valid");
    }
  })();
  if (start instanceof Error) return NextResponse.json({ message: start.message }, { status: 400 });
  const endExclusive = addDaysWIB(start, parsed.data.days);
  const dates = nightDatesWIB(start, endExclusive);

  const units = await prisma.unit.findMany({
    where: {
      ...(parsed.data.includeInactive ? {} : { isActive: true }),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
    },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      category: true,
      isActive: true,
      totalUnits: true,
    },
  });

  const unitIds = units.map((u) => u.id);
  const [dailyRates, bookingItems] = await Promise.all([
    unitIds.length
      ? prisma.unitDailyRate.findMany({
          where: { unitId: { in: unitIds }, date: { gte: start, lt: endExclusive } },
          select: { unitId: true, date: true, allotment: true },
        })
      : Promise.resolve([]),
    unitIds.length
      ? prisma.bookingItem.findMany({
          where: {
            unitId: { in: unitIds },
            booking: {
              status: { not: "cancelled" },
              checkIn: { lt: endExclusive },
              checkOut: { gt: start },
            },
          },
          select: {
            unitId: true,
            quantity: true,
            booking: { select: { checkIn: true, checkOut: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const allotmentMap = new Map<string, number>();
  for (const r of dailyRates) allotmentMap.set(`${r.unitId}|${formatDateWIB(r.date)}`, r.allotment);

  const bookedMap = new Map<string, number>();
  for (const it of bookingItems) {
    const overlapStart = it.booking.checkIn > start ? it.booking.checkIn : start;
    const overlapEnd = it.booking.checkOut < endExclusive ? it.booking.checkOut : endExclusive;
    for (const d of nightDatesWIB(overlapStart, overlapEnd)) {
      const k = `${it.unitId}|${formatDateWIB(d)}`;
      bookedMap.set(k, (bookedMap.get(k) ?? 0) + it.quantity);
    }
  }

  const items = units.map((u) => ({
    ...u,
    daily: dates.map((d) => {
      const k = `${u.id}|${formatDateWIB(d)}`;
      const allotment = allotmentMap.get(k) ?? u.totalUnits;
      const booked = bookedMap.get(k) ?? 0;
      const available = Math.max(0, allotment - booked);
      return { date: formatDateWIB(d), allotment, booked, available };
    }),
  }));

  return NextResponse.json({
    start: formatDateWIB(start),
    endExclusive: formatDateWIB(endExclusive),
    days: parsed.data.days,
    items,
  });
}
