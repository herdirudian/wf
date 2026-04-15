import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { sendSmtpTestEmail } from "@/services/email.service";

const Schema = z.object({ to: z.string().email() });

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    await sendSmtpTestEmail(parsed.data.to);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal kirim test email";
    return NextResponse.json({ message }, { status: 400 });
  }
}

