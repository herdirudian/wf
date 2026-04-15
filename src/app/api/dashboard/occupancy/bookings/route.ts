import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysWIB, formatDateWIB, parseDateWIB, startOfDayWIB } from "@/lib/time";

const QuerySchema = z.object({
  unitId: z.string().min(1),
  date: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    unitId: url.searchParams.get("unitId") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });

  const dayStart = (() => {
    try {
      return startOfDayWIB(parseDateWIB(parsed.data.date));
    } catch (e) {
      return e instanceof Error ? e : new Error("Query tidak valid");
    }
  })();
  if (dayStart instanceof Error) return NextResponse.json({ message: dayStart.message }, { status: 400 });
  const dayEnd = addDaysWIB(dayStart, 1);

  const rows = await prisma.bookingItem.findMany({
    where: {
      unitId: parsed.data.unitId,
      booking: {
        status: { not: "cancelled" },
        checkIn: { lt: dayEnd },
        checkOut: { gt: dayStart },
      },
    },
    select: {
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
    orderBy: { bookingId: "asc" },
  });

  const map = new Map<string, { id: string; code: string; status: string; checkIn: string; checkOut: string; customerName: string; phone: string; quantity: number }>();
  for (const r of rows) {
    const b = r.booking;
    const existing = map.get(b.id);
    if (existing) {
      existing.quantity += r.quantity;
    } else {
      map.set(b.id, {
        id: b.id,
        code: b.code,
        status: b.status,
        checkIn: formatDateWIB(b.checkIn),
        checkOut: formatDateWIB(b.checkOut),
        customerName: b.customer.name,
        phone: b.customer.phone,
        quantity: r.quantity,
      });
    }
  }

  return NextResponse.json({ items: Array.from(map.values()) });
}
