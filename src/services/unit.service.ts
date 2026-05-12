import { prisma } from "@/lib/prisma";

export type UnitType = string;
export type UnitCategory = string;

export type ListUnitsInput = {
  page: number;
  pageSize: number;
  type?: UnitType;
  category?: UnitCategory;
  q?: string;
};

export async function listUnits(input: ListUnitsInput) {
  const where = {
    ...(input.type ? { type: input.type } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.q
      ? {
          name: {
            contains: input.q,
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.unit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export type UpsertUnitInput = {
  name: string;
  type: string;
  category?: string | null;
  kavlingScope?: string | null;
  autoAddOnId?: string | null;
  autoAddOnMode?: string | null;
  autoAddOns?: { addOnId: string; mode: string }[];
  isActive?: boolean;
  facilities?: string[];
  capacity: number;
  totalUnits: number;
  priceWeekday: number;
  priceWeekend: number;
  description?: string | null;
  includes?: string[];
};

export async function createUnit(input: UpsertUnitInput) {
  const includesJson = input.includes?.length ? JSON.stringify(input.includes) : null;
  const facilitiesJson = input.facilities?.length ? JSON.stringify(input.facilities) : null;
  const autoAddOnsJson = input.autoAddOns?.length ? JSON.stringify(input.autoAddOns) : null;
  return prisma.unit.create({
    data: {
      name: input.name,
      type: input.type,
      category: input.category ?? null,
      kavlingScope: input.kavlingScope ?? null,
      autoAddOnId: input.autoAddOnId ?? null,
      autoAddOnMode: input.autoAddOnMode ?? null,
      autoAddOnsJson,
      isActive: input.isActive ?? true,
      facilitiesJson,
      capacity: input.capacity,
      totalUnits: input.totalUnits,
      priceWeekday: input.priceWeekday,
      priceWeekend: input.priceWeekend,
      description: input.description ?? null,
      includesJson,
    },
  });
}

export async function updateUnit(id: string, input: UpsertUnitInput) {
  const includesJson = input.includes?.length ? JSON.stringify(input.includes) : null;
  const facilitiesJson = input.facilities?.length ? JSON.stringify(input.facilities) : null;
  const autoAddOnsJson = input.autoAddOns?.length ? JSON.stringify(input.autoAddOns) : null;
  return prisma.unit.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      category: input.category ?? null,
      kavlingScope: input.kavlingScope ?? null,
      autoAddOnId: input.autoAddOnId ?? null,
      autoAddOnMode: input.autoAddOnMode ?? null,
      autoAddOnsJson,
      ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {}),
      ...(typeof input.facilities !== "undefined" ? { facilitiesJson } : {}),
      capacity: input.capacity,
      totalUnits: input.totalUnits,
      priceWeekday: input.priceWeekday,
      priceWeekend: input.priceWeekend,
      description: input.description ?? null,
      includesJson,
    },
  });
}

export async function deleteUnit(id: string) {
  const usageCount = await prisma.bookingItem.count({ where: { unitId: id } });
  if (usageCount > 0) {
    throw new Error("Unit sudah memiliki booking, tidak bisa dihapus. Gunakan edit untuk ubah stok/aturan.");
  }
  return prisma.unit.delete({ where: { id } });
}

