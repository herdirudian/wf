import { NextResponse } from "next/server";
import { createXenditInvoiceByBookingCode } from "@/services/xendit.service";

function getRequestOrigin(req: Request) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const origin = getRequestOrigin(req);
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "balance") as "dp" | "balance";
  const paymentMethodCode = url.searchParams.get("pm") ?? undefined;
  try {
    const result = await createXenditInvoiceByBookingCode({ bookingCode: code, origin, mode, paymentMethodCode });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal membuat invoice";
    return NextResponse.json({ message }, { status: 400 });
  }
}
