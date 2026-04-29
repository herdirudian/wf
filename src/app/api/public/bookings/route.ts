import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicBooking } from "@/services/booking.service";
import { parseDateRangeWIB } from "@/lib/time";

const BodySchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email(),
  }),
  specialRequest: z.string().max(2000).optional().nullable(),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  totalGuest: z.coerce.number().int().min(1),
  adultPax: z.coerce.number().int().min(1).optional(),
  childPax: z.coerce.number().int().min(0).optional(),
  kavlings: z.array(z.coerce.number().int()).optional().default([]),
  hold: z
    .object({
      id: z.string().min(1),
      token: z.string().min(1),
    })
    .optional(),
  items: z
    .array(
      z.object({
        unitId: z.string().min(1),
        quantity: z.coerce.number().int().min(0),
      }),
    )
    .default([]),
  addOns: z
    .array(
      z.object({
        addOnId: z.string().min(1),
        quantity: z.coerce.number().int().min(0),
      }),
    )
    .default([]),
});

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  try {
    const range = parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    const result = await createPublicBooking({
      customer: parsed.data.customer,
      specialRequest: parsed.data.specialRequest ?? null,
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      totalGuest: parsed.data.totalGuest,
      adultPax: parsed.data.adultPax,
      childPax: parsed.data.childPax,
      kavlings: parsed.data.kavlings,
      hold: parsed.data.hold,
      items: parsed.data.items,
      addOns: parsed.data.addOns,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal membuat booking";
    return NextResponse.json({ message }, { status: 400 });
  }
}
