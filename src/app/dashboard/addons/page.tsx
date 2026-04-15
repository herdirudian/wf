import { prisma } from "@/lib/prisma";
import { Pagination } from "@/components/ui/Pagination";
import { AddOnManager } from "@/components/addons/AddOnManager";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  if (role === "front_office") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.pageSize ?? "10") || 10));

  const [items, total] = await Promise.all([
    prisma.addOn.findMany({
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.addOn.count(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Add-Ons</h1>
          <p className="text-sm text-muted">Kelola add-on tambahan booking.</p>
        </div>
        <a
          href="/api/dashboard/export?resource=addons"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>

      <AddOnManager items={items} currentUserRole={role} />

      <Pagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}

