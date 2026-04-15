import { requireAdmin } from "@/lib/auth";
import { SettingsManager } from "@/components/settings/SettingsManager";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  if (role === "front_office") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted">Konfigurasi kavling, payment gateway, dan SMTP.</p>
        </div>
        <a
          href="/api/dashboard/export?resource=settings"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Export CSV
        </a>
      </div>
      <SettingsManager currentUserRole={role} />
    </div>
  );
}
