import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => null)) as unknown;
    const parsed = LoginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const admin = (await prisma.adminUser.findUnique({ where: { email } })) as any;
    if (!admin) {
      return NextResponse.json({ message: "Email / password salah" }, { status: 401 });
    }

    const ok = await bcrypt.compare(parsed.data.password, admin.password);
    if (!ok) {
      return NextResponse.json({ message: "Email / password salah" }, { status: 401 });
    }

    const session = await getAdminSession();
    session.adminUser = { id: admin.id, email: admin.email, role: (admin as any).role || "administrator" };
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Login error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

