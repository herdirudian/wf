import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { listBookings, type BookingStatus } from "@/services/booking.service";
import { addDaysWIB, parseDateWIB } from "@/lib/time";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["pending", "paid", "cancelled", "completed"]).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = {
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as BookingStatus | undefined,
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });

  const start = parsed.data.start ? parseDateWIB(parsed.data.start) : undefined;
  const end = parsed.data.end ? addDaysWIB(parseDateWIB(parsed.data.end), 1) : undefined;
  const data = await listBookings({ ...parsed.data, start, end });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const role =
    typeof (session.adminUser as any)?.role === "string" && String((session.adminUser as any).role).trim()
      ? String((session.adminUser as any).role)
      : "administrator";
  if (role !== "administrator") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("id") ?? "";
  if (!bookingId) return NextResponse.json({ message: "Booking id wajib" }, { status: 400 });

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, code: true } });
  if (!booking) return NextResponse.json({ message: "Booking tidak ditemukan" }, { status: 404 });

  await prisma.booking.delete({ where: { id: bookingId } });

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "DELETE_BOOKING",
    resource: "booking",
    resourceId: bookingId,
    payload: { code: booking.code },
  });

  return NextResponse.json({ ok: true });
}

