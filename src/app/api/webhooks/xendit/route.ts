import { NextResponse } from "next/server";
import { assertXenditCallbackToken, handleXenditInvoiceCallback } from "@/services/xendit.service";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/services/activity.service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await assertXenditCallbackToken(req);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const payload = (await req.json().catch(() => null)) as any;
  if (!payload || typeof payload !== "object") return NextResponse.json({ ok: true });

  const eventId = typeof payload?.id === "string" ? payload.id : typeof payload?.external_id === "string" ? payload.external_id : randomUUID();
  const externalId = typeof payload?.external_id === "string" ? payload.external_id : null;
  const payloadJson = JSON.stringify(payload);

  const event = await prisma.gatewayWebhookEvent.upsert({
    where: { gateway_eventId: { gateway: "xendit_invoice", eventId } },
    create: { gateway: "xendit_invoice", eventId, externalId, payloadJson, attempts: 1 },
    update: { externalId, payloadJson, attempts: { increment: 1 }, processError: null },
  });

  void (async () => {
    try {
      await handleXenditInvoiceCallback(payload);
      await prisma.gatewayWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), processError: null } });
      
      await logActivity({
        action: "XENDIT_WEBHOOK_PROCESSED",
        resource: "webhook_event",
        resourceId: eventId,
        payload: { externalId, status: payload.status },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Webhook process error";
      await prisma.gatewayWebhookEvent.update({ where: { id: event.id }, data: { processError: msg } }).catch(() => null);
    }
  })();

  return NextResponse.json({ ok: true });
}
