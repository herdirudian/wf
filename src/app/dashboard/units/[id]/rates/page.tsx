import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { UnitDailyRateManager } from "@/components/units/UnitDailyRateManager";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function UnitRatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unit = await prisma.unit.findUnique({ where: { id } });
  if (!unit) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted">Unit tidak ditemukan.</div>
        <Link href="/dashboard/units" className="text-sm text-foreground underline">
          Kembali
        </Link>
      </div>
    );
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);

  const items = await prisma.unitDailyRate.findMany({
    where: { unitId: id, date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Harga & Allotment Harian</h1>
          <p className="text-sm text-muted">{unit.name}</p>
        </div>
        <Link
          href="/dashboard/units"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Kembali
        </Link>
      </div>

      <UnitDailyRateManager
        unitId={unit.id}
        defaultWeekday={unit.priceWeekday}
        defaultWeekend={unit.priceWeekend}
        defaultAllotment={unit.totalUnits}
        initialStart={iso(start)}
        initialEnd={iso(end)}
        initialItems={items.map((x) => ({ date: iso(x.date), price: x.price, allotment: x.allotment }))}
      />
    </div>
  );
}
