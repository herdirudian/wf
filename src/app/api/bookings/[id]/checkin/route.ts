import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const booking = await prisma.booking.findUnique({ where: { id }, include: { payment: true } });
    if (!booking) throw new Error("Booking tidak ditemukan");
    if (booking.status === "cancelled") throw new Error("Booking sudah dibatalkan");
    if (!booking.payment) throw new Error("Payment tidak ditemukan");
    if (booking.payment.status !== "paid" && booking.payment.status !== "partial") throw new Error("Booking belum dibayar");

    const now = new Date();
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: booking.status === "completed" ? booking.status : "checked_in",
        checkedInAt: booking.checkedInAt ?? now,
        checkedInByAdminId: booking.checkedInByAdminId ?? session.adminUser.id,
      },
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal check-in";
    return NextResponse.json({ message }, { status: 400 });
  }
}

