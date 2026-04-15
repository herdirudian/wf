import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { sendBalanceReminder } from "@/services/email.service";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as { bookingId: string } | null;
  if (!json?.bookingId) return NextResponse.json({ message: "Booking ID diperlukan" }, { status: 400 });

  try {
    const res = await sendBalanceReminder(json.bookingId);
    return NextResponse.json(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal kirim email";
    return NextResponse.json({ message }, { status: 400 });
  }
}
