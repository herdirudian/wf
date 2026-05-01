"use client";

import type { Unit } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ImageCarousel } from "@/components/ui/ImageCarousel";

type FormState = {
  name: string;
  type: string;
  category: string;
  kavlingScope: "" | "paket" | "mandiri" | "private";
  autoAddOnMode: "" | "per_pax" | "per_unit" | "per_booking";
  autoAddOnId: string;
  isActive: boolean;
  facilities: string[];
  capacity: number;
  totalUnits: number;
  priceWeekday: number;
  priceWeekend: number;
  description: string;
  includesText: string;
};

function safeParseIncludesJson(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function safeParseStringArrayJson(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input) as unknown;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

function toForm(u?: Unit): FormState {
  const anyU = (u ?? {}) as unknown as {
    category?: string | null;
    kavlingScope?: string | null;
    autoAddOnId?: string | null;
    autoAddOnMode?: string | null;
    description?: string | null;
    includesJson?: string | null;
    imagesJson?: string | null;
    facilitiesJson?: string | null;
  };
  const includes = safeParseIncludesJson(anyU.includesJson ?? null);
  const facilities = safeParseStringArrayJson(anyU.facilitiesJson ?? null);
  return {
    name: u?.name ?? "",
    type: u?.type ?? "tenda",
    category: anyU.category ?? "unit",
    kavlingScope: (anyU.kavlingScope as FormState["kavlingScope"]) ?? "",
    autoAddOnMode: (anyU.autoAddOnMode as FormState["autoAddOnMode"]) ?? "",
    autoAddOnId: anyU.autoAddOnId ?? "",
    isActive: u?.isActive ?? true,
    facilities,
    capacity: u?.capacity ?? 2,
    totalUnits: u?.totalUnits ?? 0,
    priceWeekday: u?.priceWeekday ?? 0,
    priceWeekend: u?.priceWeekend ?? 0,
    description: anyU.description ?? "",
    includesText: includes.join("\n"),
  };
}

const FACILITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "wifi", label: "WiFi" },
  { key: "air_panas", label: "Air panas" },
  { key: "kids_friendly", label: "Kids friendly" },
  { key: "breakfast", label: "Breakfast" },
  { key: "parkir", label: "Parkir" },
  { key: "listrik", label: "Listrik" },
];

export function UnitManager({ items, addOns, currentUserRole }: { items: Unit[]; addOns: Array<{ id: string; name: string }>; currentUserRole: string }) {
  const isOwner = currentUserRole === "owner";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState<FormState>(() => toForm());
  const [images, setImages] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(() => (editing ? "Edit Unit" : "Tambah Unit"), [editing]);
  const localPreviews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  const typeOptions = useMemo(() => {
    const set = new Set<string>(["tenda", "cabin"]);
    for (const u of items) if (u.type) set.add(u.type);
    return Array.from(set);
  }, [items]);
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(["unit", "paket", "mandiri"]);
    for (const u of items) {
      const c = (u as unknown as { category?: string | null }).category ?? null;
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [items]);
  const addOnOptions = useMemo(() => addOns.slice().sort((a, b) => a.name.localeCompare(b.name)), [addOns]);

  useEffect(() => {
    return () => {
      for (const u of localPreviews) URL.revokeObjectURL(u);
    };
  }, [localPreviews]);

  function openCreate() {
    setEditing(null);
    setForm(toForm());
    setImages([]);
    setNewFiles([]);
    setError(null);
    setOpen(true);
  }

  function openEdit(u: Unit) {
    const anyU = u as unknown as { imagesJson?: string | null };
    setEditing(u);
    setForm(toForm(u));
    setImages(safeParseStringArrayJson(anyU.imagesJson ?? null));
    setNewFiles([]);
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setError(null);
    setNewFiles([]);
  }

  async function uploadImages(unitId: string) {
    if (!newFiles.length) return;
    const fd = new FormData();
    for (const f of newFiles) fd.append("files", f);
    const res = await fetch(`/api/units/${unitId}/images`, { method: "POST", body: fd });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message ?? "Gagal upload gambar");
    }
    const data = (await res.json().catch(() => null)) as { item?: { imagesJson?: string | null } } | null;
    const next = safeParseStringArrayJson(data?.item?.imagesJson ?? null);
    setImages(next);
    setNewFiles([]);
  }

  async function removeImage(url: string) {
    if (!editing) return;
    const res = await fetch(`/api/units/${editing.id}/images`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal hapus gambar");
      return;
    }
    const data = (await res.json().catch(() => null)) as { item?: { imagesJson?: string | null } } | null;
    const next = safeParseStringArrayJson(data?.item?.imagesJson ?? null);
    setImages(next);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const includes = form.includesText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const payload = {
      ...form,
      type: form.type.trim(),
      category: form.category.trim() ? form.category.trim() : null,
      kavlingScope: form.kavlingScope ? form.kavlingScope : null,
      autoAddOnMode: form.autoAddOnMode ? form.autoAddOnMode : null,
      autoAddOnId: form.autoAddOnId ? form.autoAddOnId : null,
      capacity: Number(form.capacity),
      totalUnits: Number(form.totalUnits),
      priceWeekday: Number(form.priceWeekday),
      priceWeekend: Number(form.priceWeekend),
      description: form.description ? form.description : null,
      includes,
    };

    const res = await fetch(editing ? `/api/units/${editing.id}` : "/api/units", {
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

    const data = (await res.json().catch(() => null)) as { item?: { id?: string } } | null;
    const unitId = editing?.id ?? data?.item?.id;
    if (!unitId) {
      setError("Gagal membaca ID unit");
      setSubmitting(false);
      return;
    }

    try {
      await uploadImages(unitId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal upload gambar";
      setError(message);
      setSubmitting(false);
      return;
    }

    closeModal();
    setSubmitting(false);
    router.refresh();
  }

  async function onDelete(u: Unit) {
    if (!confirm(`Hapus unit "${u.name}"?`)) return;
    const res = await fetch(`/api/units/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal menghapus");
      return;
    }
    router.refresh();
  }

  async function toggleActive(u: Unit) {
    const next = !u.isActive;
    if (!confirm(`${next ? "Aktifkan" : "Nonaktifkan"} unit "${u.name}"?`)) return;
    const res = await fetch(`/api/units/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(data?.message ?? "Gagal update status");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Daftar Unit</div>
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
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Kapasitas</th>
              <th className="px-4 py-3 font-medium">Stok</th>
              <th className="px-4 py-3 font-medium">Weekday</th>
              <th className="px-4 py-3 font-medium">Weekend</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {items.map((u) => (
              <tr key={u.id} className="text-foreground">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.type}</td>
                <td className="px-4 py-3">
                  {((u as unknown as { category?: string | null }).category ?? "-") as string}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                      u.isActive ? "bg-accent/20 text-foreground" : "border border-border bg-surface text-muted"
                    }`}
                  >
                    {u.isActive ? "aktif" : "nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3">{u.capacity}</td>
                <td className="px-4 py-3">{u.totalUnits}</td>
                <td className="px-4 py-3">{u.priceWeekday}</td>
                <td className="px-4 py-3">{u.priceWeekend}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/dashboard/units/${u.id}/rates`}
                      className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                    >
                      Harga
                    </Link>
                    {!isOwner && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                        >
                          {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="flex min-h-[2rem] items-center justify-center rounded-lg border border-border bg-surface px-3 py-1 text-xs shadow-sm transition-all active:scale-95 hover:bg-background"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(u)}
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
                <td className="px-4 py-6 text-center text-muted" colSpan={9}>
                  Belum ada data
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Nama</label>
              <input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Type</label>
              <input
                list="unit-type-options"
                value={form.type}
                onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Contoh: tenda, cabin, glamping"
                required
              />
              <datalist id="unit-type-options">
                {typeOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Kategori</label>
              <input
                list="unit-category-options"
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Contoh: paket, mandiri, unit"
              />
              <datalist id="unit-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Scope Kavling</label>
              <select
                value={form.kavlingScope}
                onChange={(e) => setForm((s) => ({ ...s, kavlingScope: e.target.value as FormState["kavlingScope"] }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Tidak ada</option>
                <option value="paket">Paket</option>
                <option value="private">Paket Private</option>
                <option value="mandiri">Camping Mandiri</option>
              </select>
              <div className="text-xs text-muted">Dipakai untuk membatasi pilihan nomor kavling.</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Auto Add-On (conditional)</label>
              <select
                value={form.autoAddOnMode}
                onChange={(e) => {
                  const v = e.target.value as FormState["autoAddOnMode"];
                  setForm((s) => ({ ...s, autoAddOnMode: v, autoAddOnId: v ? s.autoAddOnId : "" }));
                }}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Tidak ada</option>
                <option value="per_pax">Per pax (total guest)</option>
                <option value="per_unit">Per unit (qty)</option>
                <option value="per_booking">Per booking (1x)</option>
              </select>
              <div className="text-xs text-muted">Aktif saat unit ini dipilih pada booking.</div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Pilih Add-On</label>
              <select
                value={form.autoAddOnId}
                onChange={(e) => setForm((s) => ({ ...s, autoAddOnId: e.target.value }))}
                disabled={!form.autoAddOnMode}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">Tidak ada</option>
                {addOnOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Fasilitas</label>
              <div className="flex flex-wrap gap-2">
                {FACILITY_OPTIONS.map((opt) => {
                  const checked = form.facilities.includes(opt.key);
                  return (
                    <label key={opt.key} className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setForm((s) => ({
                            ...s,
                            facilities: on ? Array.from(new Set([...s.facilities, opt.key])) : s.facilities.filter((x) => x !== opt.key),
                          }));
                        }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
              <div className="text-xs text-muted">Badge fasilitas ditampilkan di halaman booking.</div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Kapasitas</label>
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Total Unit</label>
              <input
                type="number"
                min={0}
                value={form.totalUnits}
                onChange={(e) => setForm((s) => ({ ...s, totalUnits: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Harga Weekday</label>
              <input
                type="number"
                min={0}
                value={form.priceWeekday}
                onChange={(e) => setForm((s) => ({ ...s, priceWeekday: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Harga Weekend</label>
              <input
                type="number"
                min={0}
                value={form.priceWeekend}
                onChange={(e) => setForm((s) => ({ ...s, priceWeekend: Number(e.target.value) }))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Deskripsi</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                className="h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Deskripsi singkat paket/unit..."
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Include (1 baris = 1 item)</label>
              <textarea
                value={form.includesText}
                onChange={(e) => setForm((s) => ({ ...s, includesText: e.target.value }))}
                className="h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Contoh:\nBreakfast 2 orang\nKompor + Gas\nTiket camp"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Gambar (bisa beberapa)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <div className="text-xs text-muted">Upload setelah data unit disimpan. Maks 5MB per gambar.</div>
            </div>
          </div>

          {localPreviews.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Preview (belum tersimpan)</div>
              <ImageCarousel images={localPreviews} heightClassName="h-40" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {localPreviews.map((url) => (
                  <div key={url} className="aspect-square overflow-hidden rounded-xl border-2 border-primary/20 bg-muted shadow-sm">
                    <img src={url} alt="Preview" className="h-full w-full object-cover opacity-60 grayscale-[50%]" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {images.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Gambar tersimpan</div>
              <ImageCarousel images={images} heightClassName="h-40" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                    <img
                      src={`${url}?t=${Date.now()}`}
                      alt="Unit"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg transition-transform hover:bg-red-600 active:scale-90"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => closeModal()}
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

