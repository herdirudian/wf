"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      window.location.href = "/dashboard";
      return;
    }

    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    setError(data?.message ?? "Login gagal");
    setSubmitting(false);
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex justify-center">
          <img src="/brand/logowf.png" alt="Woodforest" className="h-12 w-12 rounded-xl object-contain" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Admin Login</h1>
        <p className="mt-1 text-sm text-muted">Woodforest Jayagiri 48 · Grounded, calm, warm</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}

