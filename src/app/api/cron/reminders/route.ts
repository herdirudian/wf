import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBalanceReminder } from "@/services/email.service";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);
  const reminderDaysStr = cfg?.reminderDays || "7,3,0,-1";
  const reminderDays = reminderDaysStr.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n));

  const now = new Date();
  const today0 = startOfDay(now);
  const todayKey = ymd(today0);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      checkIn: { gt: today0 },
      payment: { status: { not: "paid" } },
    },
    include: { payment: true, customer: true },
    take: 500,
    orderBy: { checkIn: "asc" },
  });

  let sent = 0;
  let skipped = 0;

  for (const b of bookings) {
    const p = b.payment;
    if (!p) continue;
    const outstanding = p.amount - p.paidAmount;
    if (outstanding <= 0) continue;
    if (!b.customer.email) continue;

    const dueAt = startOfDay(new Date(b.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000));
    const daysUntilDue = Math.round((dueAt.getTime() - today0.getTime()) / (24 * 60 * 60 * 1000));

    if (!reminderDays.includes(daysUntilDue)) continue;

    const tag = `due_${daysUntilDue >= 0 ? "minus_" + daysUntilDue : "plus_" + Math.abs(daysUntilDue)}`;

    const idempotencyKey = `auto_email:${tag}:${todayKey}`;
    const already = await prisma.paymentTransaction.findFirst({ where: { paymentId: p.id, action: idempotencyKey }, select: { id: true } });
    if (already) {
      skipped += 1;
      continue;
    }

    try {
      await sendBalanceReminder(b.id);
      await prisma.paymentTransaction.create({
        data: {
          paymentId: p.id,
          action: idempotencyKey,
          amountDelta: 0,
          paidAmountBefore: p.paidAmount,
          paidAmountAfter: p.paidAmount,
          method: "smtp",
        },
      });
      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, checked: bookings.length });
}
