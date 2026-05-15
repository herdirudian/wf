"use client";

import { useEffect, useState } from "react";
import { formatDateWIB } from "@/lib/time";
import { toast } from "react-hot-toast";

export default function KavlingOOOPage() {
  const [oooList, setOOOList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [kavlingNumber, setKavlingNumber] = useState("");
  const [startDate, setStartDate] = useState(formatDateWIB(new Date()));
  const [endDate, setEndDate] = useState(formatDateWIB(new Date()));
  const [reason, setReason] = useState("");

  async function fetchOOO() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/kavlings/ooo");
      const data = await res.json();
      setOOOList(data.ooo || []);
    } catch (e) {
      console.error(e);
      toast.error("Gagal memuat data OOO");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/kavlings/ooo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kavlingNumber, startDate, endDate, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal menyimpan data");
      
      toast.success("Kavling OOO berhasil ditambahkan");
      setKavlingNumber("");
      setReason("");
      fetchOOO();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus jadwal perbaikan ini? Kavling akan kembali tersedia.")) return;
    try {
      const res = await fetch(`/api/dashboard/kavlings/ooo?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus");
      toast.success("Jadwal perbaikan dihapus");
      fetchOOO();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    fetchOOO();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Kavling Out Of Order (OOO)</h1>
        <p className="text-sm text-muted">Blokir kavling tertentu untuk perbaikan atau alasan operasional lainnya.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Form Section */}
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-foreground">Tambah Perbaikan</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted uppercase">Nomor Kavling</label>
              <input
                type="number"
                value={kavlingNumber}
                onChange={(e) => setKavlingNumber(e.target.value)}
                placeholder="Contoh: 10"
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted uppercase">Mulai</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted uppercase">Selesai</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted uppercase">Alasan / Catatan</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Perbaikan deck tenda"
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-50 active:scale-95 shadow-sm"
            >
              {submitting ? "Menyimpan..." : "Simpan Jadwal"}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-foreground">
                <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted">
                  <tr>
                    <th className="px-6 py-4">Kavling</th>
                    <th className="px-6 py-4">Periode</th>
                    <th className="px-6 py-4">Alasan</th>
                    <th className="px-6 py-4">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted italic">Memuat data...</td>
                    </tr>
                  ) : oooList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted italic">Belum ada jadwal perbaikan.</td>
                    </tr>
                  ) : (
                    oooList.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 font-black text-red-600 border border-red-100">
                            {item.kavling.number}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          <div className="text-xs">{formatDateWIB(new Date(item.startDate))}</div>
                          <div className="text-[10px] text-muted font-bold uppercase tracking-tight">s/d</div>
                          <div className="text-xs">{formatDateWIB(new Date(item.endDate))}</div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted leading-relaxed">
                          {item.reason || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => onDelete(item.id)}
                            className="rounded-lg p-2 text-red-400 transition-all hover:bg-red-50 hover:text-red-600 active:scale-90"
                            title="Hapus Jadwal"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h14" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
