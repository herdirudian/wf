import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { parseDateWIB, startOfDayWIB, addDaysWIB } from "@/lib/time";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const q = url.searchParams.get("q");

  let where: any = {};

  if (date) {
    try {
      const start = startOfDayWIB(parseDateWIB(date));
      const end = addDaysWIB(start, 1);
      where.createdAt = { gte: start, lt: end };
    } catch (e) {}
  }

  if (q) {
    where.OR = [
      { action: { contains: q } },
      { resource: { contains: q } },
      { resourceId: { contains: q } },
      { payload: { contains: q } },
      { adminUser: { email: { contains: q } } },
    ];
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      adminUser: {
        select: { email: true, role: true }
      }
    }
  });

  return NextResponse.json({ logs });
}
