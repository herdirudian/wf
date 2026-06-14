import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { renderInvoiceEmailHtml, type InvoiceEmailModel } from "@/emails/invoice";
import { feeConfigFromPaymentSnapshot, feeConfigForPayment } from "@/services/xendit.service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id: paymentId } = await ctx.params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          customer: true,
          items: { include: { unit: true } },
          addOns: { include: { addOn: true } },
          kavlings: { include: { kavling: true } },
        },
      },
      transactions: {
        where: { status: "success" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!payment) return NextResponse.json({ message: "Payment tidak ditemukan" }, { status: 404 });

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);
  const dueAt = new Date(payment.booking.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000);
  const feeCfg = feeConfigFromPaymentSnapshot(payment) ?? feeConfigForPayment(cfg?.xenditPaymentMethodsJson, payment.method ?? null);

  const model: InvoiceEmailModel = {
    booking: {
      code: payment.booking.code,
      checkIn: payment.booking.checkIn,
      checkOut: payment.booking.checkOut,
      totalGuest: payment.booking.totalGuest,
      specialRequest: payment.booking.specialRequest ?? null,
      customer: {
        name: payment.booking.customer.name,
        phone: payment.booking.customer.phone,
        email: payment.booking.customer.email ?? "",
      },
      items: payment.booking.items.map((it) => ({ name: it.unit.name, quantity: it.quantity })),
      addOns: payment.booking.addOns.map((x) => ({ name: x.addOn.name, quantity: x.quantity, price: x.addOn.price })),
      kavlings: payment.booking.kavlings.map((x) => x.kavling.number),
    },
    payment: {
      amount: payment.amount,
      paidAmount: payment.paidAmount,
      dpPlannedAmount: payment.dpPlannedAmount ?? 0,
      serviceFeeAmount: payment.serviceFeeAmount ?? 0,
      dueAt,
      feeBps: feeCfg.feeBps,
      feeFlat: feeCfg.feeFlat,
      paidAt: payment.paidAt,
      method: payment.method ?? null,
      checkoutUrl: payment.checkoutUrl,
      history: payment.transactions.map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        amountDelta: t.amountDelta,
        method: t.method,
        action: t.action,
      })),
    },
  };

  const html = renderInvoiceEmailHtml(model);
  
  // Return HTML with print trigger
  const printableHtml = html.replace("</body>", "<script>window.onload = () => { window.print(); }</script></body>");

  return new NextResponse(printableHtml, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
