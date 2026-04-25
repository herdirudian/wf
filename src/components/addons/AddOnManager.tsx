"use client";

import type { AddOn } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

type FormState = { name: string; price: number };

function toForm(a?: AddOn): FormState {
  return { name: a?.name ?? "", price: a?.price ?? 0 };
}

export function AddOnManager({ items, currentUserRole }: { items: AddOn[]; currentUserRole: string }) {
  const isOwner = currentUserRole === "owner";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AddOn | null>(null);
  const [form, setForm] = useState<FormState>(() => toForm());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(() => (editing ? "Edit Add-On" : "Tambah Add-On"), [editing]);

  function openCreate() {
    setEditing(null);
    setForm(toForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(a: AddOn) {
    setEditing(a);
    setForm(toForm(a));
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = { ...form, price: Number(form.price) };
    const res = await fetch(editing ? `/api/addons/${editing.id}` : "/api/addons", {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ?? "Gagal menyimpan");
      setSubmitting(false);
      return;
    }

    setOpen(false);
    setSubmitting(false);
    router.refresh();
  }

  async function onDelete(a: AddOn) {
    if (!confirm(`Hapus add-on "${a.name}"?`)) return;
    const res = await fetch(`/api/addons/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal menghapus");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Daftar Add-On</div>
        {!isOwner && (
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-[2.5rem] items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all active:scale-95 hover:bg-primary/90"
          >
            Tambah
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Harga</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {items.map((a) => (
              <tr key={a.id} className="text-foreground">
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3">{a.price}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!isOwner && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(a)}
                          className="flex min-h-[2rem] items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1 text-xs text-red-700 shadow-sm transition-all active:scale-95 hover:bg-red-50"
                        >
                          Hapus
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={3}>
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
            <label className="text-sm font-medium text-foreground">Nama</label>
            <input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Harga</label>
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm((s) => ({ ...s, price: Number(e.target.value) }))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-[2.75rem] items-center justify-center rounded-xl border border-border bg-surface px-6 py-2 text-sm font-medium text-foreground shadow-sm transition-all active:scale-95 hover:bg-background"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[2.75rem] min-w-[100px] items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all active:scale-95 hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

