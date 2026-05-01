import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { logActivity } from "@/services/activity.service";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const { oldName, newName } = await req.json();
    if (!oldName || !newName) return NextResponse.json({ message: "Nama lama dan baru wajib diisi" }, { status: 400 });

    // Update all units with the old category name to the new name
    const result = await prisma.unit.updateMany({
      where: { category: oldName },
      data: { category: newName },
    });

    await logActivity({
      adminUserId: session.adminUser.id,
      action: "RENAME_PACKAGE_CATEGORY",
      resource: "unit_category",
      payload: { oldName, newName, affectedCount: result.count },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Gagal mengubah nama kategori" }, { status: 500 });
  }
}
