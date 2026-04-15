import { NextResponse } from "next/server";
import { getBookingByCode } from "@/services/booking.service";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const booking = await getBookingByCode(code);
    if (!booking) return NextResponse.json({ message: "Booking tidak ditemukan" }, { status: 404 });

    return NextResponse.json({
      code: booking.code,
      status: booking.status,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalGuest: booking.totalGuest,
      specialRequest: booking.specialRequest ?? null,
      customer: {
        name: booking.customer.name,
        phone: booking.customer.phone,
        email: booking.customer.email ?? "",
      },
      items: booking.items.map((it) => ({
        name: it.unit?.name ?? it.unitId,
        quantity: it.quantity,
      })),
      addOns: booking.addOns.map((it) => ({
        name: it.addOn?.name ?? it.addOnId,
        quantity: it.quantity,
        price: it.addOn?.price ?? 0,
      })),
      kavlings: booking.kavlings.map((x) => x.kavling.number),
      payment: {
        amount: booking.payment?.amount ?? 0,
        paidAmount: booking.payment?.paidAmount ?? 0,
        paidAt: booking.payment?.paidAt ?? null,
        method: booking.payment?.method ?? null,
        checkoutUrl: booking.payment?.checkoutUrl ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json({ message: "Gagal memuat data booking" }, { status: 500 });
  }
}
