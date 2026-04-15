import { prisma } from "@/lib/prisma";
import { maybeSendPaidEmails } from "@/services/email.service";

export type PaymentStatus = "pending" | "partial" | "paid" | "expired";

export type ListPaymentsInput = {
  page: number;
  pageSize: number;
  status?: PaymentStatus;
};

export async function listPayments(input: ListPaymentsInput) {
  const where = {
    ...(input.status ? { status: input.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        booking: {
          include: {
            customer: true,
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function markPaymentPaid(paymentId: string, method?: string, adminUserId?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment tidak ditemukan");

  const updated = await prisma.$transaction(async (tx) => {
    const before = payment.paidAmount ?? 0;
    const after = payment.amount;
    const delta = after - before;
    const nextMethod = method ?? payment.method ?? "manual";

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "paid",
        paidAmount: after,
        method: nextMethod,
        paidAt: new Date(),
      },
    });

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { status: "paid" },
    });

    if (delta !== 0) {
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          adminUserId: adminUserId ?? null,
          action: "mark_paid",
          amountDelta: delta,
          paidAmountBefore: before,
          paidAmountAfter: after,
          method: nextMethod,
        },
      });
    }

    return updated;
  });

  await maybeSendPaidEmails(paymentId).catch(() => null);
  return updated;
}

export async function markPaymentPending(paymentId: string, adminUserId?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    const before = payment.paidAmount ?? 0;
    const after = 0;
    const delta = after - before;

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "pending", paidAmount: 0, paidAt: null, method: null },
    });

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { status: "pending" },
    });

    if (delta !== 0) {
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          adminUserId: adminUserId ?? null,
          action: "set_pending",
          amountDelta: delta,
          paidAmountBefore: before,
          paidAmountAfter: after,
          method: null,
        },
      });
    }

    return updated;
  });
}

export async function addPaymentAmount(paymentId: string, amount: number, method?: string, adminUserId?: string) {
  const delta = Math.round(Number(amount));
  if (!Number.isFinite(delta) || delta <= 0) throw new Error("Nominal pembayaran tidak valid");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
  if (!payment) throw new Error("Payment tidak ditemukan");
  if (payment.status === "expired") throw new Error("Payment expired");
  if (payment.booking.status === "cancelled") throw new Error("Booking cancelled");

  const shouldSend = payment.status !== "paid";
  const updated = await prisma.$transaction(async (tx) => {
    const before = payment.paidAmount ?? 0;
    const nextPaidAmount = Math.max(0, Math.min(payment.amount, before + delta));
    const nextStatus: PaymentStatus =
      nextPaidAmount >= payment.amount && payment.amount > 0 ? "paid" : nextPaidAmount > 0 ? "partial" : "pending";
    const nextPaidAt = nextStatus === "paid" ? new Date() : null;
    const nextMethod = method ?? payment.method ?? "manual";

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        paidAmount: nextPaidAmount,
        status: nextStatus,
        method: nextMethod,
        paidAt: nextPaidAt,
      },
    });

    if (payment.booking.status !== "completed") {
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: nextStatus === "paid" ? "paid" : "pending" },
      });
    }

    const appliedDelta = nextPaidAmount - before;
    if (appliedDelta !== 0) {
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          adminUserId: adminUserId ?? null,
          action: "add",
          amountDelta: appliedDelta,
          paidAmountBefore: before,
          paidAmountAfter: nextPaidAmount,
          method: nextMethod,
        },
      });
    }

    return updated;
  });

  if (shouldSend && updated.status === "paid") {
    await maybeSendPaidEmails(paymentId).catch(() => null);
  }
  return updated;
}

export async function handlePaymentWebhookPlaceholder(payload: unknown) {
  return { ok: true, received: payload };
}
