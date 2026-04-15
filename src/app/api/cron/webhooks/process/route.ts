import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleXenditInvoiceCallback } from "@/services/xendit.service";

export async function POST(req: Request) {
  const token = (process.env.CRON_TOKEN ?? "").trim();
  if (!token) return NextResponse.json({ message: "CRON_TOKEN belum diset" }, { status: 400 });
  const url = new URL(req.url);
  const gotHeader = req.headers.get("x-cron-token") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const gotAuth = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : auth;
  const gotQuery = url.searchParams.get("token") ?? "";
  const got = (gotHeader || gotAuth || gotQuery).trim();
  if (got !== token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const events = await prisma.gatewayWebhookEvent.findMany({
    where: { gateway: "xendit_invoice", processedAt: null },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    take: 300,
  });

  let processed = 0;
  let failed = 0;

  for (const ev of events) {
    try {
      const payload = JSON.parse(ev.payloadJson);
      await handleXenditInvoiceCallback(payload);
      await prisma.gatewayWebhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), processError: null } });
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Process error";
      await prisma.gatewayWebhookEvent.update({ where: { id: ev.id }, data: { processError: msg, attempts: { increment: 1 } } }).catch(() => null);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, failed, checked: events.length });
}
