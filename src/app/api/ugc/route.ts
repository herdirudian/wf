import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  title: z.string().min(1),
  caption: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const items = await prisma.ugcHighlight.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const item = await prisma.ugcHighlight.create({
    data: {
      title: parsed.data.title,
      caption: parsed.data.caption ?? null,
      isActive: parsed.data.isActive ?? true,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  });
  return NextResponse.json({ item });
}

