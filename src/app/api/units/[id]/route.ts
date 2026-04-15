import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, requireAdminMutation } from "@/lib/auth";
import { deleteUnit, updateUnit } from "@/services/unit.service";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";

const UpdateUnitSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  category: z.string().optional().nullable(),
  kavlingScope: z.enum(["paket", "mandiri", "private"]).optional().nullable(),
  autoAddOnId: z.string().min(1).optional().nullable(),
  autoAddOnMode: z.enum(["per_pax", "per_unit", "per_booking"]).optional().nullable(),
  isActive: z.boolean().optional(),
  facilities: z.array(z.string()).optional(),
  capacity: z.number().int().min(1),
  totalUnits: z.number().int().min(0),
  priceWeekday: z.number().int().min(0),
  priceWeekend: z.number().int().min(0),
  description: z.string().optional().nullable(),
  includes: z.array(z.string()).optional(),
}).refine((v) => (!v.autoAddOnId && !v.autoAddOnMode) || (!!v.autoAddOnId && !!v.autoAddOnMode), {
  message: "Auto add-on harus lengkap (add-on dan mode)",
  path: ["autoAddOnMode"],
});

const ToggleActiveSchema = z.object({
  isActive: z.boolean(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMutation();
  if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = UpdateUnitSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const unit = await updateUnit(id, parsed.data);
  return NextResponse.json({ item: unit });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMutation();
  if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = ToggleActiveSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const unit = await prisma.unit.update({ where: { id }, data: { isActive: parsed.data.isActive } });
  return NextResponse.json({ item: unit });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMutation();
  if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  try {
    const unit = await prisma.unit.findUnique({ where: { id }, select: { id: true, imagesJson: true } });
    if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

    await deleteUnit(id);

    const dir = path.join(process.cwd(), "public", "uploads", "units", id);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal menghapus unit";
    return NextResponse.json({ message }, { status: 400 });
  }
}

