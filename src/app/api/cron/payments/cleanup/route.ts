import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const normalizeToken = (v: string) => {
    const t = v.trim();
    if ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
    return t;
  };

  const token = normalizeToken(process.env.CRON_TOKEN ?? "");
  if (!token) return NextResponse.json({ message: "CRON_TOKEN belum diset" }, { status: 400 });
  const url = new URL(req.url);
  const gotHeader = req.headers.get("x-cron-token") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const gotAuth = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : auth;
  const gotQuery = url.searchParams.get("token") ?? "";
  const raw = [gotHeader, gotAuth, gotQuery].find((v) => v && v.trim().length > 0) ?? "";
  const got = normalizeToken(raw);
  if (got !== token) {
    const source = raw === gotHeader ? "x-cron-token" : raw === gotAuth ? "authorization" : raw === gotQuery ? "query" : "none";
    return NextResponse.json(
      { message: "Unauthorized", meta: { source, gotLen: got.length, expectedLen: token.length } },
      { status: 401 },
    );
  }

  const now = new Date();

  const targets = await prisma.payment.findMany({
    where: {
      status: "pending",
      paidAmount: 0,
      gateway: "xendit_invoice",
      gatewayExpiresAt: { not: null, lt: now },
      booking: { status: { not: "cancelled" } },
    },
    include: { booking: true },
    take: 500,
    orderBy: [{ gatewayExpiresAt: "asc" }, { id: "asc" }],
  });

  let cancelled = 0;
  let skipped = 0;

  for (const p of targets) {
    const idempotencyKey = `auto_cancel_expired_invoice:${p.gatewayExternalId ?? p.id}`;
    const already = await prisma.paymentTransaction.findFirst({
      where: { paymentId: p.id, action: idempotencyKey },
      select: { id: true },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    const didCancel = await prisma.$transaction(async (tx) => {
      const latest = await tx.payment.findUnique({ where: { id: p.id }, include: { booking: true } });
      if (!latest) return false;
      if (latest.paidAmount > 0) return false;
      if (latest.status !== "pending") return false;
      if (latest.gateway !== "xendit_invoice") return false;
      if (!latest.gatewayExpiresAt || latest.gatewayExpiresAt >= now) return false;
      if (latest.booking.status === "cancelled") return false;

      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: "expired",
          gatewayStatus: "EXPIRED",
        },
      });
      await tx.booking.update({ where: { id: p.bookingId }, data: { status: "cancelled" } });
      await tx.paymentTransaction.create({
        data: {
          paymentId: p.id,
          action: idempotencyKey,
          amountDelta: 0,
          paidAmountBefore: 0,
          paidAmountAfter: 0,
          method: "cron",
        },
      });
      return true;
    });

    if (didCancel) cancelled += 1;
    else skipped += 1;
  }

  return NextResponse.json({ ok: true, cancelled, skipped, checked: targets.length });
}
