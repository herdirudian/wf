import { NextResponse } from "next/server";
import { z } from "zod";
import { getAvailability } from "@/services/booking.service";
import { parseDateRangeWIB } from "@/lib/time";

const QuerySchema = z.object({
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  type: z.string().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    checkIn: url.searchParams.get("checkIn") ?? undefined,
    checkOut: url.searchParams.get("checkOut") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });
  const range = (() => {
    try {
      return parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    } catch (e) {
      return e instanceof Error ? e : new Error("Query tidak valid");
    }
  })();
  if (range instanceof Error) return NextResponse.json({ message: range.message }, { status: 400 });

  const data = await getAvailability({ checkIn: range.checkIn, checkOut: range.checkOut, type: parsed.data.type });
  return NextResponse.json(data);
}
