import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyKavlingUpdated } from "@/lib/realtime";

const BodySchema = z.object({
  holdId: z.string().min(1),
  holdToken: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

    await prisma.kavlingHold.deleteMany({
      where: { id: parsed.data.holdId, token: parsed.data.holdToken },
    });

    await notifyKavlingUpdated();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Release hold error:", err);
    return NextResponse.json({ message: err.message || "Gagal melepas hold" }, { status: 500 });
  }
}

