import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.ugcHighlight.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, caption: true, imageUrl: true },
  });
  return NextResponse.json({ items });
}

