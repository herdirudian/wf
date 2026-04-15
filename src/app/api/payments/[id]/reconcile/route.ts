import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { reconcileXenditPaymentById } from "@/services/xendit.service";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const r = await reconcileXenditPaymentById(id);
    return NextResponse.json(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal reconcile";
    return NextResponse.json({ message }, { status: 400 });
  }
}

