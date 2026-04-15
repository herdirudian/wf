import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const item = await prisma.customer.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { unit: true } },
          payment: true,
        },
      },
    },
  });

  if (!item) return NextResponse.json({ message: "Customer tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ item });
}

