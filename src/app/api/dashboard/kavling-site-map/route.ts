import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

async function resolveRole(session: { adminUser?: { id: string; role?: unknown } }) {
  const raw = session.adminUser?.role;
  if (typeof raw === "string" && raw.trim()) return raw;
  const id = session.adminUser?.id;
  if (!id) return null;
  const row = await (prisma.adminUser as any).findUnique({ where: { id }, select: { role: true } });
  const role = row?.role;
  if (typeof role === "string" && role.trim()) return role;
  return "administrator";
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const role = await resolveRole(session);
  if (role !== "administrator") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "File tidak ditemukan" }, { status: 400 });
  if (file.type !== "image/png") return NextResponse.json({ message: "Hanya PNG yang diizinkan" }, { status: 400 });

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) return NextResponse.json({ message: "Ukuran gambar maksimal 5MB" }, { status: 400 });

  const dir = path.join(process.cwd(), "public", "kavling");
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, "site-map.png"), buf);

  return NextResponse.json({ ok: true, url: "/kavling/site-map.png", version: Date.now() });
}

