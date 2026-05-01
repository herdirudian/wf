import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, requireAdminMutation } from "@/lib/auth";
import { createUnit, listUnits } from "@/services/unit.service";
import { logActivity } from "@/services/activity.service";

const CreateUnitSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  category: z.string().optional().nullable(),
  kavlingScope: z.enum(["paket", "mandiri", "private"]).optional().nullable(),
  autoAddOnId: z.string().min(1).optional().nullable(),
  autoAddOnMode: z.enum(["per_pax", "per_unit", "per_booking"]).optional().nullable(),
  isActive: z.boolean().optional(),
  facilities: z.array(z.string()).optional(),
  capacity: z.number().int().min(1),
  totalUnits: z.number().int().min(0),
  priceWeekday: z.number().int().min(0),
  priceWeekend: z.number().int().min(0),
  description: z.string().optional().nullable(),
  includes: z.array(z.string()).optional(),
}).refine((v) => (!v.autoAddOnId && !v.autoAddOnMode) || (!!v.autoAddOnId && !!v.autoAddOnMode), {
  message: "Auto add-on harus lengkap (add-on dan mode)",
  path: ["autoAddOnMode"],
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "10") || 10));
  const type = url.searchParams.get("type") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  const data = await listUnits({
    page,
    pageSize,
    type: type ? type : undefined,
    q,
    category: category ? category : undefined,
  });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireAdminMutation();
  if (auth.error) return NextResponse.json({ message: auth.error }, { status: auth.status });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateUnitSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const unit = await createUnit(parsed.data);

  // Ensure public upload directory exists
  const uploadDir = path.join(process.cwd(), "public", "uploads", "units", unit.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const session = await getAdminSession();
  await logActivity({
    adminUserId: session.adminUser?.id,
    action: "CREATE_UNIT",
    resource: "unit",
    resourceId: unit.id,
    payload: { name: unit.name },
  });

  return NextResponse.json({ item: unit });
}

