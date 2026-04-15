import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  await prisma.addOn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

