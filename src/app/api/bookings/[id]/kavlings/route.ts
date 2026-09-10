import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { getKavlingContext, setKavlingAssignment } from "@/services/booking.service";
import { prisma } from "@/lib/prisma";
import { parseDateRangeWIB } from "@/lib/time";
import { getKavlingSets } from "@/lib/kavling-config";

const QuerySchema = z.object({
  unitId: z.string().min(1),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    unitId: url.searchParams.get("unitId") ?? undefined,
    checkIn: url.searchParams.get("checkIn") ?? undefined,
    checkOut: url.searchParams.get("checkOut") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });

  try {
    const range =
      parsed.data.checkIn && parsed.data.checkOut ? parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut) : null;
    const ctxData = await getKavlingContext({
      bookingId: id,
      unitId: parsed.data.unitId,
      range: range ? { checkIn: range.checkIn, checkOut: range.checkOut } : undefined,
    });
    const cfg = await prisma.appConfig.upsert({
      where: { id: 1 },
      create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null, holdMinutes: 5 },
      update: {},
    });
    const unit = await prisma.unit.findUnique({
      where: { id: parsed.data.unitId },
      select: { category: true, name: true, kavlingScope: true },
    });
    if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

    const sets = getKavlingSets(cfg);
    const scopeRaw = (unit.kavlingScope ?? "").toLowerCase();
    const raw = (unit.category ?? "").toLowerCase();
    const n = unit.name.toLowerCase();
    const scope =
      scopeRaw === "private"
        ? "private"
        : scopeRaw === "mandiri"
          ? "mandiri"
          : scopeRaw === "paket"
            ? "paket"
            : raw.includes("private") || n.includes("private")
              ? "private"
              : raw.includes("mandiri") || raw.includes("kavling") || n.includes("mandiri") || n.includes("kavling")
                ? "mandiri"
                : "paket";

    const allowed = scope === "private" ? sets.privateList : sets.regularList;

    return NextResponse.json({
      ...ctxData,
      all: allowed,
      scope,
      privateRange: sets.privateList.length ? { start: sets.privateList[0], end: sets.privateList[sets.privateList.length - 1] } : { start: 58, end: 65 },
      privateKavlings: sets.privateList,
      regularKavlings: sets.regularList,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal load kavling";
    return NextResponse.json({ message }, { status: 400 });
  }
}

const PutSchema = z.object({
  unitId: z.string().min(1),
  numbers: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map((x) => String(x).trim().toUpperCase()).filter(Boolean)),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    await setKavlingAssignment({ bookingId: id, unitId: parsed.data.unitId, numbers: parsed.data.numbers });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal simpan kavling";
    return NextResponse.json({ message }, { status: 400 });
  }
}
