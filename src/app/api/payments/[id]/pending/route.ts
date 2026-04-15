import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { markPaymentPending } from "@/services/payment.service";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const item = await markPaymentPending(id, session.adminUser.id);
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal update payment";
    return NextResponse.json({ message }, { status: 400 });
  }
}

