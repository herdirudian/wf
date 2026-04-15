import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/ui/Pagination";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.pageSize ?? "10") || 10));
  const q = typeof sp.q === "string" ? sp.q : undefined;

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Customer</h1>
          <p className="text-sm text-muted">Daftar customer dan history booking.</p>
        </div>
        <a
          href={`/api/dashboard/export?resource=customers&q=${encodeURIComponent(q ?? "")}`}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      <form className="flex items-end gap-3" method="get">
        <div className="flex-1">
          <label className="text-sm font-medium text-foreground">Search</label>
          <input
            name="q"
            defaultValue={q ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Nama / phone / email..."
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Cari
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {items.map((c) => (
              <tr key={c.id} className="text-foreground">
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">{c.email ?? "-"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/customers/${c.id}`}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs hover:bg-background"
                  >
                    Lihat History
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={4}>
                  Belum ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}

