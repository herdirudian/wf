import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDashboardMetrics } from "@/services/report.service";

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const data = await getDashboardMetrics();
  return NextResponse.json(data);
}

