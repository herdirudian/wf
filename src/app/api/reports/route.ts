import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getReports } from "@/services/report.service";

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const data = await getReports();
  return NextResponse.json(data);
}

