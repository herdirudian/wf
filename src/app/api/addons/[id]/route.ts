import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";

const UpdateSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const item = await prisma.addOn.update({ where: { id }, data: parsed.data });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "UPDATE_ADDON",
    resource: "addon",
    resourceId: id,
    payload: { name: item.name, price: item.price },
  });

  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const item = await prisma.addOn.findUnique({ where: { id } });
  await prisma.addOn.delete({ where: { id } });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "DELETE_ADDON",
    resource: "addon",
    resourceId: id,
    payload: { name: item?.name },
  });

  return NextResponse.json({ ok: true });
}

