import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
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

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const category = form.get("category") as string | null;

  if (!file || !category) {
    return NextResponse.json({ message: "File atau kategori tidak ditemukan" }, { status: 400 });
  }

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ message: "Ukuran gambar maksimal 5MB" }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "packages");
  await fs.mkdir(uploadDir, { recursive: true });

  const ext = safeExt(file.name) || ".jpg";
  const name = `${category.toLowerCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadDir, name), buf);

  return NextResponse.json({ url: `/uploads/packages/${name}` });
}
