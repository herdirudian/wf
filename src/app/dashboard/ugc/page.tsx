import { prisma } from "@/lib/prisma";
import { UgcHighlightManager } from "@/components/ugc/UgcHighlightManager";

export default async function UgcPage() {
  const items = await prisma.ugcHighlight.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">UGC</h1>
          <p className="text-sm text-muted">Kelola highlight foto testimoni/UGC.</p>
        </div>
        <a
          href="/api/dashboard/export?resource=ugc"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>
      <UgcHighlightManager items={items.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() }))} />
    </div>
  );
}
