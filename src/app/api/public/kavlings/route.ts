import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseDateRangeWIB } from "@/lib/time";

const QuerySchema = z.object({
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  scope: z.enum(["paket", "mandiri", "private", "mixed"]).optional(),
  holdId: z.string().optional(),
  holdToken: z.string().optional(),
});

function deriveCategoryFromUnit(u: { category: string | null; name: string; kavlingScope: string | null }) {
  const scope = (u.kavlingScope ?? "").toLowerCase();
  if (scope === "private") return "private";
  if (scope === "mandiri") return "mandiri";
  if (scope === "paket") return "paket";
  const raw = (u.category ?? "").toLowerCase();
  if (raw.includes("mandiri") || raw.includes("kavling")) return "mandiri";
  if (raw.includes("paket")) return "paket";
  const n = u.name.toLowerCase();
  if (n.includes("mandiri") || n.includes("kavling")) return "mandiri";
  return "paket";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    checkIn: url.searchParams.get("checkIn") ?? undefined,
    checkOut: url.searchParams.get("checkOut") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    holdId: url.searchParams.get("holdId") ?? undefined,
    holdToken: url.searchParams.get("holdToken") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });
  const range = (() => {
    try {
      return parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    } catch (e) {
      return e instanceof Error ? e : new Error("Query tidak valid");
    }
  })();
  if (range instanceof Error) return NextResponse.json({ message: range.message }, { status: 400 });

  const cfg = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null, holdMinutes: 5 },
    update: {},
  });

  const privateStart = Math.max(1, Math.min(cfg.privateKavlingStart, cfg.kavlingSellCount));
  const privateEnd = Math.max(privateStart, Math.min(cfg.privateKavlingEnd, cfg.kavlingSellCount));
  const scope = parsed.data.scope ?? "paket";

  const baseAll = Array.from({ length: cfg.kavlingSellCount }).map((_, i) => i + 1);
  const allowed =
    scope === "mixed"
      ? baseAll
      : scope === "private"
        ? baseAll.filter((n) => n >= privateStart && n <= privateEnd)
        : baseAll.filter((n) => n < privateStart || n > privateEnd);
  const allowedSet = new Set(allowed);

  const myHold =
    parsed.data.holdId && parsed.data.holdToken
      ? await prisma.kavlingHold.findFirst({
          where: { id: parsed.data.holdId, token: parsed.data.holdToken },
          include: { kavlings: { include: { kavling: true } } },
        })
      : null;

  const excludeHoldId = myHold?.id ?? null;
  const now = new Date();

  const oooRows = await prisma.kavlingOOO.findMany({
    where: {
      startDate: { lt: range.checkOut },
      endDate: { gt: range.checkIn },
    },
    include: { kavling: true },
  });

  const rows = await prisma.bookingKavling.findMany({
    where: {
      booking: {
        status: { not: "cancelled" },
        checkIn: { lt: range.checkOut },
        checkOut: { gt: range.checkIn },
      },
    },
    include: {
      kavling: true,
      booking: { select: { status: true } },
      unit: { select: { category: true, name: true, kavlingScope: true } },
    },
  });

  const holdRows = await prisma.kavlingHoldKavling.findMany({
    where: {
      hold: {
        expiresAt: { gt: now },
        checkIn: { lt: range.checkOut },
        checkOut: { gt: range.checkIn },
        ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}),
      },
    },
    include: { kavling: true, hold: { select: { scope: true } } },
  });

  const takenPaid = new Set<number>();
  const takenHeld = new Set<number>();
  const takenOOO = new Set<number>();

  for (const r of oooRows) {
    if (!allowedSet.has(r.kavling.number)) continue;
    takenOOO.add(r.kavling.number);
  }

  for (const r of rows) {
    if (!allowedSet.has(r.kavling.number)) continue;
    const status = r.booking.status;
    if (status === "pending") {
      takenHeld.add(r.kavling.number);
    } else {
      takenPaid.add(r.kavling.number);
    }
  }

  for (const r of holdRows) {
    if (!allowedSet.has(r.kavling.number)) continue;
    takenHeld.add(r.kavling.number);
  }

  const paid = Array.from(takenPaid).sort((a, b) => a - b);
  const held = Array.from(takenHeld).sort((a, b) => a - b);
  const ooo = Array.from(takenOOO).sort((a, b) => a - b);
  const taken = Array.from(new Set([...paid, ...held, ...ooo])).sort((a, b) => a - b);

  return NextResponse.json({
    all: allowed,
    taken,
    paid,
    held,
    ooo,
    myHold: myHold && myHold.expiresAt > now ? {
      id: myHold.id,
      token: myHold.token,
      expiresAt: myHold.expiresAt,
      numbers: myHold.kavlings.map(x => x.kavling.number).sort((a, b) => a - b)
    } : null,
    scope,
    sellCount: cfg.kavlingSellCount,
    privateRange: { start: privateStart, end: privateEnd },
  });
}
