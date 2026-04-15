import { NextResponse } from "next/server";
import { handlePaymentWebhookPlaceholder } from "@/services/payment.service";

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as unknown;
  const result = await handlePaymentWebhookPlaceholder(payload);
  return NextResponse.json(result);
}

