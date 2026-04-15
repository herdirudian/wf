import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "10") || 10));

  const [items, total] = await Promise.all([
    prisma.addOn.findMany({
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.addOn.count(),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const item = await prisma.addOn.create({ data: parsed.data });
  return NextResponse.json({ item });
}

