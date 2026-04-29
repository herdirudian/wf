"use client";

import { useEffect, useState } from "react";
import { formatDateWIB } from "@/lib/time";

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(formatDateWIB(new Date()));
  const [q, setQ] = useState("");

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/activity-logs?date=${date}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [date]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Log Aktivitas</h1>
          <p className="text-sm text-muted">Mencatat seluruh aktivitas penting di dashboard admin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Cari</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Aksi, Resource, Email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-64"
              />
              <button
                onClick={fetchLogs}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-primary/90 active:scale-95"
              >
                Cari
              </button>
            </div>
          </div>
        </div>
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted">
                    Memuat data...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted">
                    Tidak ada log aktivitas untuk tanggal ini.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/5">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-medium">
                        {new Date(log.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div className="text-[10px] text-muted">
                        {new Date(log.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
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
