import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { addPaymentAmount } from "@/services/payment.service";
import { createXenditInvoiceByBookingCode } from "@/services/xendit.service";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  amount: z.coerce.number(),
  method: z.string().min(1).optional(),
  gateway: z.enum(["manual", "xendit"]).optional().default("manual"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const { amount, method, gateway } = parsed.data;

  try {
    if (gateway === "xendit") {
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          booking: {
            include: {
              customer: true,
              items: { include: { unit: true } },
              addOns: { include: { addOn: true } },
              kavlings: { include: { kavling: true } },
            },
          },
        },
      });
      if (!payment) return NextResponse.json({ message: "Payment tidak ditemukan" }, { status: 404 });

      // Create partial invoice in Xendit
      const result = await createXenditInvoiceByBookingCode({
        bookingCode: payment.booking.code,
        mode: "partial",
        partialAmount: amount,
        origin: new URL(req.url).origin,
      });

      return NextResponse.json({ invoiceUrl: result.invoiceUrl });
    }

    const item = await addPaymentAmount(id, amount, method, session.adminUser.id);
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal tambah pembayaran";
    return NextResponse.json({ message }, { status: 400 });
  }
}
