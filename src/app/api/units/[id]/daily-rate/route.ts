import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysWIB, formatDateWIB, parseDateWIB, startOfDayWIB } from "@/lib/time";

function isWeekendWIB(d: Date) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d);
  return wd === "Sat" || wd === "Sun";
}

function dateRangeWIB(start: Date, end: Date) {
  const s = startOfDayWIB(start);
  const e = startOfDayWIB(end);
  const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  const dates: Date[] = [];
  for (let i = 0; i <= days; i++) dates.push(addDaysWIB(s, i));
  return dates;
}

const QuerySchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
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
  const end = (() => {
    try {
      return startOfDayWIB(parseDateWIB(parsed.data.end));
    } catch (e) {
      return e instanceof Error ? e : new Error("Query tidak valid");
    }
  })();
  if (end instanceof Error) return NextResponse.json({ message: end.message }, { status: 400 });
  if (end < start) return NextResponse.json({ message: "Range tanggal tidak valid" }, { status: 400 });

  const items = await prisma.unitDailyRate.findMany({
    where: { unitId: id, date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    items: items.map((x) => ({
      id: x.id,
      date: formatDateWIB(x.date),
      price: x.price,
      allotment: x.allotment,
    })),
  });
}

const GenerateSchema = z.object({
  action: z.literal("generate"),
  start: z.string().min(1),
  end: z.string().min(1),
  priceWeekday: z.coerce.number().int().min(0),
  priceWeekend: z.coerce.number().int().min(0),
  allotment: z.coerce.number().int().min(0),
  overwrite: z.coerce.boolean().optional().default(false),
});

const SetSchema = z.object({
  action: z.literal("set"),
  entries: z.array(
    z.object({
      date: z.string().min(1),
      price: z.coerce.number().int().min(0).optional(),
      allotment: z.coerce.number().int().min(0).optional(),
    }),
  ),
});

const AdjustSchema = z.object({
  action: z.literal("adjust"),
  start: z.string().min(1),
  end: z.string().min(1),
  percent: z.coerce.number().int().min(-90).max(500),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;

  const gen = GenerateSchema.safeParse(json);
  if (gen.success) {
    const start = startOfDayWIB(parseDateWIB(gen.data.start));
    const end = startOfDayWIB(parseDateWIB(gen.data.end));
    if (end < start) return NextResponse.json({ message: "Range tanggal tidak valid" }, { status: 400 });

    const dates = dateRangeWIB(start, end);
    const data = dates.map((d) => ({
      unitId: id,
      date: d,
      price: isWeekendWIB(d) ? gen.data.priceWeekend : gen.data.priceWeekday,
      allotment: gen.data.allotment,
    }));

    await prisma.$transaction(async (tx) => {
      if (gen.data.overwrite) {
        await tx.unitDailyRate.deleteMany({ where: { unitId: id, date: { gte: start, lte: end } } });
        await tx.unitDailyRate.createMany({ data });
      } else {
        await tx.unitDailyRate.createMany({ data, skipDuplicates: true });
      }
    });

    return NextResponse.json({ ok: true });
  }

  const adj = AdjustSchema.safeParse(json);
  if (adj.success) {
    const start = startOfDayWIB(parseDateWIB(adj.data.start));
    const end = startOfDayWIB(parseDateWIB(adj.data.end));
    if (end < start) return NextResponse.json({ message: "Range tanggal tidak valid" }, { status: 400 });

    const unit = await prisma.unit.findUnique({
      where: { id },
      select: { id: true, priceWeekday: true, priceWeekend: true, totalUnits: true },
    });
    if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

    const existing = await prisma.unitDailyRate.findMany({
      where: { unitId: id, date: { gte: start, lte: end } },
      select: { date: true, price: true, allotment: true },
    });
    const map = new Map(existing.map((x) => [formatDateWIB(x.date), x]));

    const factor = 1 + adj.data.percent / 100;
    const dates = dateRangeWIB(start, end);

    await prisma.$transaction(async (tx) => {
      for (const d of dates) {
        const key = formatDateWIB(d);
        const ex = map.get(key);
        const basePrice = ex?.price ?? (isWeekendWIB(d) ? unit.priceWeekend : unit.priceWeekday);
        const baseAllotment = ex?.allotment ?? unit.totalUnits;
        const price = Math.max(0, Math.round(basePrice * factor));

        await tx.unitDailyRate.upsert({
          where: { unitId_date: { unitId: id, date: d } },
          update: { price, allotment: baseAllotment },
          create: { unitId: id, date: d, price, allotment: baseAllotment },
        });
      }
    });

    return NextResponse.json({ ok: true });
  }

  const set = SetSchema.safeParse(json);
  if (!set.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const unit = await prisma.unit.findUnique({ where: { id }, select: { id: true, priceWeekday: true, priceWeekend: true, totalUnits: true } });
  if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

  for (const e of set.data.entries) {
    const d = startOfDayWIB(parseDateWIB(e.date));
    const price = e.price ?? (isWeekendWIB(d) ? unit.priceWeekend : unit.priceWeekday);
    const allotment = e.allotment ?? unit.totalUnits;
    await prisma.unitDailyRate.upsert({
      where: { unitId_date: { unitId: id, date: d } },
      update: { price, allotment },
      create: { unitId: id, date: d, price, allotment },
    });
  }

  return NextResponse.json({ ok: true });
}
