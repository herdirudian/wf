import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "10") || 10));
  const q = url.searchParams.get("q") ?? undefined;

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

