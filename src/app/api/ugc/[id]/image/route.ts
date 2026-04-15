import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";

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
  const item = await prisma.ugcHighlight.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ message: "Data tidak ditemukan" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "File tidak ditemukan" }, { status: 400 });

  const maxBytes = 5 * 1024 * 1024;
  if (!file.type.startsWith("image/")) return NextResponse.json({ message: "Hanya file gambar yang diizinkan" }, { status: 400 });
  if (file.size > maxBytes) return NextResponse.json({ message: "Ukuran gambar maksimal 5MB" }, { status: 400 });

  const uploadDir = path.join(process.cwd(), "public", "uploads", "ugc", id);
  await fs.mkdir(uploadDir, { recursive: true });

  const ext = safeExt(file.name) || ".png";
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadDir, name), buf);

  if (item.imageUrl) {
    const prefix = `/uploads/ugc/${id}/`;
    if (item.imageUrl.startsWith(prefix)) {
      const filename = item.imageUrl.slice(prefix.length);
      if (filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\")) {
        const old = path.join(process.cwd(), "public", "uploads", "ugc", id, filename);
        await fs.unlink(old).catch(() => null);
      }
    }
  }

  const updated = await prisma.ugcHighlight.update({
    where: { id },
    data: { imageUrl: `/uploads/ugc/${id}/${name}` },
  });

  return NextResponse.json({ item: updated });
}

