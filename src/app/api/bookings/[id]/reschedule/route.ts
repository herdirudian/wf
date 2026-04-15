import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { rescheduleBooking } from "@/services/booking.service";
import { parseDateRangeWIB } from "@/lib/time";

const BodySchema = z.object({
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  kavlingsByUnit: z.record(z.string(), z.array(z.number().int())).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    const range = parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    const booking = await rescheduleBooking(id, range.checkIn, range.checkOut, { kavlingsByUnit: parsed.data.kavlingsByUnit });
    if (!booking) throw new Error("Booking tidak ditemukan");
    return NextResponse.json({ item: booking });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal reschedule";
    return NextResponse.json({ message }, { status: 400 });
  }
}

