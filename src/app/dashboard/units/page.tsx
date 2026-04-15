import { listUnits } from "@/services/unit.service";
import { Pagination } from "@/components/ui/Pagination";
import { UnitManager } from "@/components/units/UnitManager";
import { prisma } from "@/lib/prisma";

import { requireAdmin } from "@/lib/auth";

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.pageSize ?? "10") || 10));
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const category = typeof sp.category === "string" ? sp.category : undefined;

  const data = await listUnits({ page, pageSize, q, type, category });
  const addOns = await prisma.addOn.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Unit</h1>
          <p className="text-sm text-muted">Kelola unit tenda & cabin.</p>
        </div>
        <a
          href={`/api/dashboard/export?resource=units&q=${encodeURIComponent(q ?? "")}&type=${encodeURIComponent(type ?? "")}&category=${encodeURIComponent(category ?? "")}`}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" method="get">
        <div className="flex-1">
          <label className="text-sm font-medium text-foreground">Search</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Nama unit..."
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Type</label>
          <select
            name="type"
            defaultValue={type ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Semua</option>
            <option value="tenda">Tenda</option>
            <option value="cabin">Cabin</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Kategori</label>
          <select
            name="category"
            defaultValue={category ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Semua</option>
            <option value="paket">Paket</option>
            <option value="mandiri">Mandiri</option>
            <option value="unit">Unit</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      <UnitManager items={data.items} addOns={addOns} currentUserRole={role} />

      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}

