"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function UserManager({ currentUserRole }: { currentUserRole: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ id: "", email: "", password: "", role: "front_office" });
  const [isEditing, setIsEditing] = useState(false);

  const isOwner = currentUserRole === "owner";
  const isFO = currentUserRole === "front_office";

  async function loadUsers() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/dashboard/users");
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || "Gagal memuat pengguna");
    } else {
      setUsers(data?.users || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!isFO) loadUsers();
  }, [isFO]);

  if (isFO) {
    return <div className="p-4 text-sm text-red-600">Anda tidak memiliki akses ke halaman ini.</div>;
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    if (isOwner) return;

    setSaving(true);
    setError(null);
    
    const method = isEditing ? "PUT" : "POST";
    const res = await fetch("/api/dashboard/users", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || "Gagal menyimpan pengguna");
      setSaving(false);
      return;
    }

    setForm({ id: "", email: "", password: "", role: "front_office" });
    setIsEditing(false);
    setSaving(false);
    loadUsers();
  }

  async function deleteUser(id: string) {
    if (isOwner || !confirm("Yakin ingin menghapus pengguna ini?")) return;
    
    setSaving(true);
    setError(null);
    const res = await fetch("/api/dashboard/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || "Gagal menghapus pengguna");
    } else {
      loadUsers();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pengguna Admin</h1>
        <p className="text-sm text-muted">Kelola akun administrator, owner, dan front office.</p>
      </div>

      {!isOwner && (
        <form onSubmit={saveUser} className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{isEditing ? "Edit Pengguna" : "Tambah Pengguna"}</h2>
          {error && <div className="mb-4 text-xs text-red-600">{error}</div>}
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={saving || (isEditing && form.role === 'administrator')}
                className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Password {isEditing && "(Opsional)"}</label>
              <input
                type="password"
                required={!isEditing}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={saving}
                className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                disabled={saving}
                className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="administrator">Administrator</option>
                <option value="owner">Owner (Read-only)</option>
                <option value="front_office">Front Office</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={saving}
                className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ id: "", email: "", password: "", role: "front_office" });
                    setIsEditing(false);
                    setError(null);
                  }}
                  disabled={saving}
                  className="h-9 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        {loading ? (
          <div className="py-4 text-center text-sm text-muted">Memuat...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium text-muted">Email</th>
                  <th className="pb-2 font-medium text-muted">Role</th>
                  <th className="pb-2 font-medium text-muted">Tgl Dibuat</th>
                  {!isOwner && <th className="pb-2 text-right font-medium text-muted">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id} className="group">
                    <td className="py-3 font-medium text-foreground">{u.email}</td>
                    <td className="py-3 text-foreground capitalize">{u.role.replace('_', ' ')}</td>
                    <td className="py-3 text-muted">{new Date(u.createdAt).toLocaleDateString("id-ID")}</td>
                    {!isOwner && (
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setForm({ id: u.id, email: u.email, password: "", role: u.role });
                            setIsEditing(true);
                            setError(null);
                          }}
                          className="text-xs font-medium text-blue-600 hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(u.id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}