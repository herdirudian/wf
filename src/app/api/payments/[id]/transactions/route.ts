import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const items = await prisma.paymentTransaction.findMany({
    where: { paymentId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { adminUser: { select: { email: true } } },
  });

  return NextResponse.json({
    items: items.map((x) => ({
      id: x.id,
      createdAt: x.createdAt.toISOString(),
      action: x.action,
      amountDelta: x.amountDelta,
      paidAmountBefore: x.paidAmountBefore,
      paidAmountAfter: x.paidAmountAfter,
      method: x.method,
      adminEmail: x.adminUser?.email ?? null,
    })),
  });
}

