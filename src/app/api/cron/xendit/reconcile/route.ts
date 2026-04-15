import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileXenditPaymentById } from "@/services/xendit.service";

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

  const targets = await prisma.payment.findMany({
    where: {
      gateway: "xendit_invoice",
      gatewayRef: { not: null },
      status: { in: ["pending", "partial"] },
    },
    orderBy: [{ id: "asc" }],
    take: 150,
  });

  let ok = 0;
  let failed = 0;

  for (const p of targets) {
    const idempotencyKey = `cron_reconcile_xendit:${p.gatewayRef}`;
    const already = await prisma.paymentTransaction.findFirst({ where: { paymentId: p.id, action: idempotencyKey }, select: { id: true } });
    if (already) continue;
    try {
      await reconcileXenditPaymentById(p.id);
      await prisma.paymentTransaction.create({
        data: {
          paymentId: p.id,
          action: idempotencyKey,
          amountDelta: 0,
          paidAmountBefore: p.paidAmount,
          paidAmountAfter: p.paidAmount,
          method: "cron",
        },
      });
      ok += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, reconciled: ok, failed, checked: targets.length });
}
