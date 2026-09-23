import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicBooking } from "@/services/booking.service";
import { parseDateRangeWIB } from "@/lib/time";

const BodySchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Nama wajib diisi"),
    phone: z.string().trim().min(6, "Nomor WhatsApp/Telepon minimal 6 karakter"),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().email("Format email tidak valid"),
    ),
  }),
  specialRequest: z.string().max(2000).optional().nullable(),
  checkIn: z.string().min(1, "Tanggal Check-in wajib diisi"),
  checkOut: z.string().min(1, "Tanggal Check-out wajib diisi"),
  totalGuest: z.coerce.number().int().min(1, "Jumlah tamu minimal 1"),
  adultPax: z.coerce.number().int().min(1).optional(),
  child5to10Pax: z.coerce.number().int().min(0).optional(),
  childUnder5Pax: z.coerce.number().int().min(0).optional(),
  kavlings: z.array(z.union([z.string(), z.number()])).optional().default([]),
  hold: z
    .object({
      id: z.string().min(1),
      token: z.string().min(1),
    })
    .optional()
    .nullable(),
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
  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0];
    const fieldName = firstIssue?.path?.join(".") ?? "";
    const detailMsg = firstIssue?.message ?? "Input tidak valid";
    const fullMessage = fieldName ? `Input tidak valid (${fieldName}: ${detailMsg})` : detailMsg;
    return NextResponse.json({ message: fullMessage, issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const range = parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    const result = await createPublicBooking({
      customer: parsed.data.customer,
      specialRequest: parsed.data.specialRequest ?? null,
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      totalGuest: parsed.data.totalGuest,
      adultPax: parsed.data.adultPax,
      child5to10Pax: parsed.data.child5to10Pax,
      childUnder5Pax: parsed.data.childUnder5Pax,
      kavlings: parsed.data.kavlings,
      hold: parsed.data.hold ?? undefined,
      items: parsed.data.items,
      addOns: parsed.data.addOns,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal membuat booking";
    return NextResponse.json({ message }, { status: 400 });
  }
}
