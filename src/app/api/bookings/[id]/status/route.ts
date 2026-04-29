import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { updateBookingStatus } from "@/services/booking.service";
import { logActivity } from "@/services/activity.service";

const BodySchema = z.object({
  status: z.enum(["pending", "paid", "checked_in", "cancelled", "completed"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    const booking = await updateBookingStatus(id, parsed.data.status);

    await logActivity({
      adminUserId: session.adminUser.id,
      action: "UPDATE_BOOKING_STATUS",
      resource: "booking",
      resourceId: id,
      payload: { code: booking.code, status: parsed.data.status },
    });

    return NextResponse.json({ item: booking });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal update status";
    return NextResponse.json({ message }, { status: 400 });
  }
}

