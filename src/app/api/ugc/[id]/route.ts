import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  title: z.string().min(1),
  caption: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const PatchSchema = z.object({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const item = await prisma.ugcHighlight.update({
    where: { id },
    data: {
      title: parsed.data.title,
      caption: parsed.data.caption ?? null,
      ...(typeof parsed.data.isActive === "boolean" ? { isActive: parsed.data.isActive } : {}),
      ...(typeof parsed.data.sortOrder === "number" ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const item = await prisma.ugcHighlight.update({
    where: { id },
    data: {
      ...(typeof parsed.data.isActive === "boolean" ? { isActive: parsed.data.isActive } : {}),
      ...(typeof parsed.data.sortOrder === "number" ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const item = await prisma.ugcHighlight.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ message: "Data tidak ditemukan" }, { status: 404 });

  await prisma.ugcHighlight.delete({ where: { id } });
  const dir = path.join(process.cwd(), "public", "uploads", "ugc", id);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  return NextResponse.json({ ok: true });
}

