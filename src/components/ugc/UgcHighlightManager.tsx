"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

type UgcHighlight = {
  id: string;
  title: string;
  caption: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  title: string;
  caption: string;
  isActive: boolean;
  sortOrder: number;
};

function toForm(x?: UgcHighlight): FormState {
  return {
    title: x?.title ?? "",
    caption: x?.caption ?? "",
    isActive: x?.isActive ?? true,
    sortOrder: x?.sortOrder ?? 0,
  };
}

export function UgcHighlightManager({ items }: { items: UgcHighlight[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UgcHighlight | null>(null);
  const [form, setForm] = useState<FormState>(() => toForm());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(() => (editing ? "Edit UGC Highlight" : "Tambah UGC Highlight"), [editing]);

  function openCreate() {
    setEditing(null);
    setForm(toForm());
    setFile(null);
    setError(null);
    setOpen(true);
  }

  function openEdit(x: UgcHighlight) {
    setEditing(x);
    setForm(toForm(x));
    setFile(null);
    setError(null);
    setOpen(true);
  }

  async function toggleActive(x: UgcHighlight) {
    const res = await fetch(`/api/ugc/${x.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !x.isActive }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal update status");
      return;
    }
    router.refresh();
  }

  async function onDelete(x: UgcHighlight) {
    if (!confirm(`Hapus UGC "${x.title}"?`)) return;
    const res = await fetch(`/api/ugc/${x.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal menghapus");
      return;
    }
    router.refresh();
  }

  async function uploadImage(id: string) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/ugc/${id}/image`, { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) throw new Error(data?.message ?? "Gagal upload gambar");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (editing) {
        const res = await fetch(`/api/ugc/${editing.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            caption: form.caption ? form.caption : null,
            isActive: form.isActive,
            sortOrder: Number(form.sortOrder),
          }),
        });
        const data = (await res.json().catch(() => null)) as { item?: UgcHighlight; message?: string } | null;
        if (!res.ok) throw new Error(data?.message ?? "Gagal menyimpan");
        await uploadImage(editing.id);
      } else {
        const res = await fetch("/api/ugc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            caption: form.caption ? form.caption : null,
            isActive: form.isActive,
            sortOrder: Number(form.sortOrder),
          }),
        });
        const data = (await res.json().catch(() => null)) as { item?: UgcHighlight; message?: string } | null;
        if (!res.ok) throw new Error(data?.message ?? "Gagal membuat");
        const id = data?.item?.id;
        if (!id) throw new Error("Gagal membuat");
        await uploadImage(id);
      }

      setOpen(false);
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Gagal menyimpan");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">UGC Highlights</div>
          <div className="mt-1 text-xs text-muted">Tampil di halaman booking sebagai social proof.</div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[2.25rem] items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all active:scale-95 hover:bg-primary/90"
        >
          Tambah
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Gambar</th>
              <th className="px-4 py-3 font-medium">Judul</th>
              <th className="px-4 py-3 font-medium">Aktif</th>
              <th className="px-4 py-3 font-medium">Urutan</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface text-foreground">
            {items.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-3">
                  {x.imageUrl ? (
                    <img src={x.imageUrl} alt="" className="h-12 w-20 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-20 rounded-lg border border-border bg-background" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{x.title}</div>
                  {x.caption ? <div className="mt-1 text-xs text-muted">{x.caption}</div> : null}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => toggleActive(x)}
                    className={`flex min-h-[1.5rem] w-full items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-all active:scale-95 ${
                      x.isActive ? "bg-accent/20 text-foreground" : "border border-border bg-surface text-muted"
                    }`}
                  >
                    {x.isActive ? "aktif" : "nonaktif"}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">{x.sortOrder}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(x)}
                      className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-border bg-surface px-2 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(x)}
                      className="flex min-h-[1.75rem] items-center justify-center rounded-lg border border-red-200 bg-white px-2 text-xs text-red-700 shadow-sm transition-all active:scale-95 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                  Belum ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Judul</label>
            <input
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Caption (opsional)</label>
            <textarea
              value={form.caption}
              onChange={(e) => setForm((s) => ({ ...s, caption: e.target.value }))}
              className="h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Urutan</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
                />
                Aktif
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Gambar (opsional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile((e.target.files?.[0] as File) ?? null)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <div className="text-xs text-muted">Maks 5MB.</div>
          </div>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-[2.25rem] items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-sm transition-all active:scale-95 hover:bg-background"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[2.25rem] items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

