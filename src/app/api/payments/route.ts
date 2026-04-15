import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { listPayments } from "@/services/payment.service";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["pending", "partial", "paid", "expired"]).optional(),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = {
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ message: "Query tidak valid" }, { status: 400 });

  const data = await listPayments(parsed.data);
  return NextResponse.json(data);
}

