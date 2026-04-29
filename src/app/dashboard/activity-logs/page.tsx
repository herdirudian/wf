import { prisma } from "@/lib/prisma";
import { formatDateWIB } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ActivityLogsPage() {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      adminUser: {
        select: { email: true, role: true }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Log Aktivitas</h1>
        <p className="text-sm text-muted">Mencatat seluruh aktivitas penting di dashboard admin untuk kebutuhan audit.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted">
              <tr>
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Admin</th>
                <th className="px-6 py-4">Aksi</th>
                <th className="px-6 py-4">Resource</th>
                <th className="px-6 py-4">Detail</th>
                <th className="px-6 py-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted">
                    Belum ada log aktivitas yang tercatat.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/10">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-medium">
                        {log.createdAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div className="text-[10px] text-muted">
                        {log.createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {log.adminUser ? (
                        <div>
                          <div className="font-semibold">{log.adminUser.email}</div>
                          <div className="text-[10px] capitalize text-muted">{log.adminUser.role.replace(/_/g, " ")}</div>
                        </div>
                      ) : (
                        <span className="italic text-muted">Sistem (Webhook)</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${
                        log.action.includes("DELETE") ? "bg-red-100 text-red-700" :
                        log.action.includes("UPDATE") || log.action.includes("EDIT") ? "bg-amber-100 text-amber-700" :
                        log.action.includes("CREATE") ? "bg-emerald-100 text-emerald-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium capitalize">{log.resource?.replace(/_/g, " ")}</div>
                      <div className="text-[10px] font-mono text-muted">{log.resourceId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs truncate text-xs text-muted" title={log.payload || ""}>
                        {log.payload || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[10px] text-muted">
                      {log.ipAddress || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
