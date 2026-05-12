import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { createAdminBooking } from "@/services/booking.service";
import { parseDateRangeWIB } from "@/lib/time";

const Schema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(6),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().email().optional().nullable(),
    ),
  }),
  specialRequest: z.string().max(2000).optional().nullable(),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  totalGuest: z.coerce.number().int().min(1),
  adultPax: z.coerce.number().int().min(0).optional(),
  child5to10Pax: z.coerce.number().int().min(0).optional(),
  childUnder5Pax: z.coerce.number().int().min(0).optional(),
  kavlings: z.array(z.coerce.number().int()).optional().default([]),
  paymentSeed: z
    .object({
      kind: z.enum(["unpaid", "dp_paid", "paid"]),
      paidAmount: z.coerce.number().int().min(0),
    })
    .optional(),
  dp: z
    .object({
      mode: z.enum(["percent", "nominal"]),
      value: z.coerce.number(),
    })
    .optional(),
  hold: z
    .object({
      id: z.string().min(1),
      token: z.string().min(1),
    })
    .optional(),
  items: z.array(z.object({ unitId: z.string().min(1), quantity: z.coerce.number().int().min(0) })),
  addOns: z.array(z.object({ addOnId: z.string().min(1), quantity: z.coerce.number().int().min(0) })).optional(),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Input tidak valid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const range = parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    const r = await createAdminBooking({
      customer: { ...parsed.data.customer, email: parsed.data.customer.email ?? null },
      specialRequest: parsed.data.specialRequest ?? null,
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      totalGuest: parsed.data.totalGuest,
      adultPax: parsed.data.adultPax,
      child5to10Pax: parsed.data.child5to10Pax,
      childUnder5Pax: parsed.data.childUnder5Pax,
      kavlings: parsed.data.kavlings,
      adminUserId: session.adminUser.id,
      paymentSeed: parsed.data.paymentSeed,
      dp: parsed.data.dp,
      hold: parsed.data.hold,
      items: parsed.data.items,
      addOns: parsed.data.addOns ?? [],
    });
    return NextResponse.json(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal membuat booking";
    return NextResponse.json({ message }, { status: 400 });
  }
}
