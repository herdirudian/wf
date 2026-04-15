import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";

function parseJsonArray(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [] as string[];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function safeExt(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();
  if (!ext) return "";
  if (!/^\.[a-z0-9]+$/.test(ext)) return "";
  return ext.slice(0, 10);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const unit = await prisma.unit.findUnique({ where: { id }, select: { id: true, imagesJson: true } });
  if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((x): x is File => x instanceof File);
  if (!files.length) return NextResponse.json({ message: "File tidak ditemukan" }, { status: 400 });

  const maxBytes = 5 * 1024 * 1024;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "units", id);
  await fs.mkdir(uploadDir, { recursive: true });

  const existing = parseJsonArray(unit.imagesJson);
  const next = [...existing];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ message: "Hanya file gambar yang diizinkan" }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return NextResponse.json({ message: "Ukuran gambar maksimal 5MB" }, { status: 400 });
    }

    const ext = safeExt(file.name) || ".jpg";
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadDir, name), buf);
    next.push(`/uploads/units/${id}/${name}`);
  }

  const updated = await prisma.unit.update({
    where: { id },
    data: { imagesJson: JSON.stringify(next) },
  });

  return NextResponse.json({ item: updated });
}

const DeleteSchema = z.object({
  url: z.string().min(1),
});

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const unit = await prisma.unit.findUnique({ where: { id }, select: { id: true, imagesJson: true } });
  if (!unit) return NextResponse.json({ message: "Unit tidak ditemukan" }, { status: 404 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = DeleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const urls = parseJsonArray(unit.imagesJson);
  const next = urls.filter((x) => x !== parsed.data.url);

  const prefix = `/uploads/units/${id}/`;
  if (parsed.data.url.startsWith(prefix)) {
    const filename = parsed.data.url.slice(prefix.length);
    if (filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\")) {
      const filePath = path.join(process.cwd(), "public", "uploads", "units", id, filename);
      await fs.unlink(filePath).catch(() => null);
    }
  }

  const updated = await prisma.unit.update({
    where: { id },
    data: { imagesJson: JSON.stringify(next) },
  });

  return NextResponse.json({ item: updated });
}
