import { listUnits } from "@/services/unit.service";
import { PackageManager } from "@/components/packages/PackageManager";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  await requireAdmin();
  
  // Fetch all units to get unique categories
  const { items: units } = await listUnits({ page: 1, pageSize: 1000 });
  
  const categories = Array.from(new Set(units.map(u => u.category).filter(Boolean) as string[]));
  
  // Sort categories similar to booking page
  const sortedCategories = categories.sort((a, b) => {
    if (a === "Glamping") return -1;
    if (b === "Glamping") return 1;
    if (a === "Paket") return -1;
    if (b === "Paket") return 1;
    return a.localeCompare(b);
  });

  return <PackageManager categories={sortedCategories} />;
}
