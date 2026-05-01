"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type PackageConfig = {
  description?: string;
  imageUrl?: string;
};

type PackageConfigs = Record<string, PackageConfig>;

export function PackageManager({ categories: initialCategories }: { categories: string[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [configs, setConfigs] = useState<PackageConfigs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState<{ original: string; current: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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

  async function handleRename(oldName: string, newName: string) {
    if (!newName || oldName === newName) {
      setEditingName(null);
      return;
    }

    try {
      const res = await fetch("/api/dashboard/packages/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });

      if (!res.ok) throw new Error("Gagal mengubah nama kategori");

      // Update local state
      setCategories(categories.map((c) => (c === oldName ? newName : c)));
      setConfigs((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });

      setEditingName(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName) return;
    if (categories.includes(newCategoryName)) {
      alert("Kategori sudah ada");
      return;
    }

    setCategories([...categories, newCategoryName]);
    setConfigs((prev) => ({
      ...prev,
      [newCategoryName]: { description: "" },
    }));
    setNewCategoryName("");
    setIsAdding(false);
  }

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
        <div className="flex items-center gap-3">
          {isAdding ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                placeholder="Nama kategori baru..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCategory();
                  if (e.key === "Escape") setIsAdding(false);
                }}
                className="h-10 rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={handleAddCategory}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-95"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:bg-muted/10 active:scale-95"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-surface px-4 text-sm font-semibold text-primary transition-all hover:bg-primary/5 active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Tambah Kategori
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex min-h-[2.5rem] items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
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
              <div className="flex items-center justify-between gap-2">
                {editingName?.original === cat ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editingName.current}
                      onChange={(e) => setEditingName({ ...editingName, current: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(cat, editingName.current);
                        if (e.key === "Escape") setEditingName(null);
                      }}
                      className="flex-1 rounded-lg border border-primary/30 bg-background px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={() => handleRename(cat, editingName.current)}
                      className="text-primary hover:text-primary/80"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-foreground">{cat}</h3>
                    <button
                      onClick={() => setEditingName({ original: cat, current: cat })}
                      className="text-muted hover:text-primary transition-colors"
                      title="Ubah Nama"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </>
                )}
              </div>
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
