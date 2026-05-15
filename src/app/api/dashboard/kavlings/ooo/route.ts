import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { parseDateWIB, startOfDayWIB } from "@/lib/time";
import { logActivity } from "@/services/activity.service";
import { notifyKavlingUpdated } from "@/lib/realtime";

const CreateSchema = z.object({
  kavlingNumber: z.coerce.number().int().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ooo = await prisma.kavlingOOO.findMany({
    include: { kavling: true },
    orderBy: { startDate: "desc" },
    take: 100,
  });

  return NextResponse.json({ ooo });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

    const kavling = await prisma.kavling.findUnique({
      where: { number: parsed.data.kavlingNumber },
    });
    if (!kavling) return NextResponse.json({ message: "Kavling tidak ditemukan" }, { status: 404 });

    const start = startOfDayWIB(parseDateWIB(parsed.data.startDate));
    const end = startOfDayWIB(parseDateWIB(parsed.data.endDate));

    if (end < start) return NextResponse.json({ message: "Tanggal selesai tidak boleh sebelum tanggal mulai" }, { status: 400 });

    const item = await prisma.kavlingOOO.create({
      data: {
        kavlingId: kavling.id,
        startDate: start,
        endDate: end,
        reason: parsed.data.reason,
      },
    });

    await logActivity({
      adminUserId: session.adminUser.id,
      action: "CREATE_OOO",
      resource: `Kavling ${parsed.data.kavlingNumber}`,
      payload: JSON.stringify(item),
    });

    await notifyKavlingUpdated();

    return NextResponse.json({ item });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Gagal membuat data OOO" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "ID diperlukan" }, { status: 400 });

  try {
    const item = await prisma.kavlingOOO.delete({
      where: { id },
      include: { kavling: true }
    });

    await logActivity({
      adminUserId: session.adminUser.id,
      action: "DELETE_OOO",
      resource: `Kavling ${item.kavling.number}`,
      payload: JSON.stringify(item),
    });

    await notifyKavlingUpdated();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Gagal menghapus data OOO" }, { status: 500 });
  }
}
