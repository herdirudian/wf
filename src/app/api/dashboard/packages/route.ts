import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), "public", "uploads", "packages", "config.json");

async function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
}

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({});
  }
}

export async function PUT(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const json = await req.json();
    await ensureConfigDir();
    await fs.writeFile(CONFIG_PATH, JSON.stringify(json, null, 2));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "Gagal simpan konfigurasi" }, { status: 500 });
  }
}
