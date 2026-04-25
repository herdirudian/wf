"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type PackageConfig = {
  description?: string;
  imageUrl?: string;
};

type PackageConfigs = Record<string, PackageConfig>;

export function PackageManager({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [configs, setConfigs] = useState<PackageConfigs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/dashboard/packages");
        if (res.ok) {
          const data = await res.json();
          setConfigs(data);
        }
      } catch (err) {
        console.error("Failed to load package configs", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/packages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configs),
      });
      if (!res.ok) throw new Error("Gagal menyimpan konfigurasi");
      router.refresh();
      alert("Konfigurasi berhasil disimpan");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(category: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);

    try {
      const res = await fetch("/api/dashboard/packages/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Gagal upload gambar");
      }
      const data = await res.json();
      setConfigs((prev) => ({
        ...prev,
        [category]: { ...prev[category], imageUrl: data.url },
      }));
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center">Memuat...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manajemen Paket</h1>
          <p className="text-sm text-muted">Atur deskripsi dan gambar untuk setiap kategori paket di halaman booking.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex min-h-[2.5rem] items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat} className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="aspect-video relative bg-muted flex items-center justify-center overflow-hidden">
              {configs[cat]?.imageUrl ? (
                <img
                  src={`${configs[cat].imageUrl}?t=${Date.now()}`}
                  alt={cat}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted">Belum ada gambar</span>
              )}
              <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <label className="cursor-pointer rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white">
                  Ganti Gambar
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(cat, file);
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <h3 className="font-semibold text-foreground">{cat}</h3>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">Deskripsi</label>
                <textarea
                  value={configs[cat]?.description || ""}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [cat]: { ...prev[cat], description: e.target.value },
                    }))
                  }
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={`Deskripsi untuk paket ${cat}...`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
