import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { addPaymentAmount } from "@/services/payment.service";

const BodySchema = z.object({
  amount: z.coerce.number(),
  method: z.string().min(1).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    const item = await addPaymentAmount(id, parsed.data.amount, parsed.data.method, session.adminUser.id);
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal tambah pembayaran";
    return NextResponse.json({ message }, { status: 400 });
  }
}
