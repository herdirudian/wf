import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const adminUser = await requireAdmin();
  return <DashboardShell adminUser={adminUser as any}>{children}</DashboardShell>;
}

