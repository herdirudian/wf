import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const booking = await prisma.booking.findUnique({ where: { id }, include: { payment: true } });
    if (!booking) throw new Error("Booking tidak ditemukan");
    if (booking.status === "cancelled") throw new Error("Booking sudah dibatalkan");
    if (!booking.checkedInAt) throw new Error("Belum check-in");
    if (booking.checkedOutAt) return NextResponse.json({ item: booking });

    const now = new Date();
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: "completed",
        checkedOutAt: now,
        checkedOutByAdminId: session.adminUser.id,
      },
    });

    await logActivity({
      adminUserId: session.adminUser.id,
      action: "BOOKING_CHECKOUT",
      resource: "booking",
      resourceId: id,
      payload: { code: booking.code },
    });

    return NextResponse.json({ item: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal check-out";
    return NextResponse.json({ message }, { status: 400 });
  }
}

