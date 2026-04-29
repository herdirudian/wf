import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logActivity } from "@/services/activity.service";

const UserSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  password: z.string().optional(),
  role: z.enum(["administrator", "owner", "front_office"]),
});

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

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  
  const role = await resolveRole(session);
  if (role === "front_office") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const users = await (prisma.adminUser as any).findMany({
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const role = await resolveRole(session);
  if (role !== "administrator") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UserSchema.safeParse(json);
  if (!parsed.success || !parsed.data.password) {
    return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });
  }

  const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ message: "Email sudah digunakan" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);

  const user = await (prisma.adminUser as any).create({
    data: {
      email: parsed.data.email,
      password: hashedPassword,
      role: parsed.data.role,
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "CREATE_USER",
    resource: "admin_user",
    resourceId: user.id,
    payload: { email: user.email, role: user.role },
  });

  return NextResponse.json({ user });
}

export async function PUT(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const role = await resolveRole(session);
  if (role !== "administrator") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UserSchema.safeParse(json);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });
  }

  const dataToUpdate: any = { role: parsed.data.role, email: parsed.data.email };
  if (parsed.data.password) {
    dataToUpdate.password = await bcrypt.hash(parsed.data.password, 10);
  }

  const user = await (prisma.adminUser as any).update({
    where: { id: parsed.data.id },
    data: dataToUpdate,
    select: { id: true, email: true, role: true, createdAt: true },
  });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "UPDATE_USER",
    resource: "admin_user",
    resourceId: user.id,
    payload: { email: user.email, role: user.role },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const role = await resolveRole(session);
  if (role !== "administrator") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  if (!json?.id) return NextResponse.json({ message: "ID tidak valid" }, { status: 400 });

  if (json.id === session.adminUser.id) {
    return NextResponse.json({ message: "Tidak dapat menghapus diri sendiri" }, { status: 400 });
  }

  const target = await prisma.adminUser.findUnique({ where: { id: json.id } });
  await prisma.adminUser.delete({ where: { id: json.id } });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "DELETE_USER",
    resource: "admin_user",
    resourceId: json.id,
    payload: { email: target?.email },
  });

  return NextResponse.json({ ok: true });
}
