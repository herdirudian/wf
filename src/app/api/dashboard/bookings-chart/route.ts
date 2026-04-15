import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysWIB, formatDateWIB, parseDateWIB, startOfDayWIB } from "@/lib/time";

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

  const units = await prisma.unit.findMany({
    where: {
      ...(parsed.data.includeInactive ? {} : { isActive: true }),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
    },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, category: true, isActive: true },
  });

  const unitIds = units.map((u) => u.id);
  const items = unitIds.length
    ? await prisma.bookingItem.findMany({
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
          booking: {
            select: {
              id: true,
              code: true,
              status: true,
              checkIn: true,
              checkOut: true,
              customer: { select: { name: true, phone: true } },
            },
          },
        },
        orderBy: [{ unitId: "asc" }, { bookingId: "asc" }],
      })
    : [];

  const byUnit = new Map<string, Array<{ bookingId: string; code: string; status: string; checkIn: string; checkOut: string; customerName: string; phone: string; quantity: number }>>();
  for (const it of items) {
    const b = it.booking;
    const row = {
      bookingId: b.id,
      code: b.code,
      status: b.status,
      checkIn: formatDateWIB(b.checkIn),
      checkOut: formatDateWIB(b.checkOut),
      customerName: b.customer.name,
      phone: b.customer.phone,
      quantity: it.quantity,
    };
    const arr = byUnit.get(it.unitId) ?? [];
    arr.push(row);
    byUnit.set(it.unitId, arr);
  }

  return NextResponse.json({
    start: formatDateWIB(start),
    endExclusive: formatDateWIB(endExclusive),
    days: parsed.data.days,
    units: units.map((u) => ({
      ...u,
      bookings: byUnit.get(u.id) ?? [],
    })),
  });
}
