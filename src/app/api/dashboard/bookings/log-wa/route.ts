import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as { bookingId: string } | null;
  if (!json?.bookingId) return NextResponse.json({ message: "Booking ID diperlukan" }, { status: 400 });

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: json.bookingId },
      include: { payment: true },
    });

    if (!booking || !booking.payment) {
      return NextResponse.json({ message: "Booking atau payment tidak ditemukan" }, { status: 404 });
    }

    await prisma.paymentTransaction.create({
      data: {
        paymentId: booking.payment.id,
        action: "wa_followup_clicked",
        amountDelta: 0,
        paidAmountBefore: booking.payment.paidAmount,
        paidAmountAfter: booking.payment.paidAmount,
        method: "whatsapp",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal mencatat log";
    return NextResponse.json({ message }, { status: 500 });
  }
}
