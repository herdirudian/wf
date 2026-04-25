"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/front-office", label: "Resepsionis" },
  { href: "/dashboard/packages", label: "Paket" },
  { href: "/dashboard/units", label: "Unit" },
  { href: "/dashboard/bookings", label: "Booking" },
  { href: "/dashboard/bookings/monitoring", label: "Monitoring" },
  { href: "/dashboard/payments", label: "Payment" },
  { href: "/dashboard/payments/audit", label: "Audit Payment" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/users", label: "Pengguna" },
  { href: "/dashboard/addons", label: "Add-Ons" },
  { href: "/dashboard/ugc", label: "UGC" },
  { href: "/dashboard/customers", label: "Customer" },
  { href: "/dashboard/reports", label: "Reports" },
];

export function DashboardShell({
  children,
  adminUser,
}: {
  children: ReactNode;
  adminUser: { id: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role =
    typeof (adminUser as any)?.role === "string" && String((adminUser as any).role).trim()
      ? String((adminUser as any).role)
      : "administrator";
  const roleLabel = role.replace(/_/g, " ");

  const activeHref = useMemo(() => {
    const exact = navItems.find((x) => x.href === pathname)?.href;
    if (exact) return exact;
    if (!pathname) return null;
    const byPrefix = navItems
      .filter((x) => x.href !== "/dashboard")
      .sort((a, b) => b.href.length - a.href.length)
      .find((x) => pathname.startsWith(x.href));
    return byPrefix?.href ?? null;
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [activeHref]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    const isFO = role === "front_office";

    return (
      <nav className="space-y-1">
        {navItems
          .filter((item) => {
            if (
              isFO &&
              (item.href === "/dashboard/settings" ||
                item.href === "/dashboard/addons" ||
                item.href === "/dashboard/users" ||
                item.href === "/dashboard/ugc" ||
                item.href === "/dashboard/units" ||
                item.href === "/dashboard/packages" ||
                item.href === "/dashboard/reports")
            )
              return false;
            return true;
          })
          .map((item) => {
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`block rounded-xl px-3 py-2 text-sm ${
                isActive ? "bg-background font-semibold text-foreground" : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="lg:hidden fixed inset-x-0 top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="px-4 py-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-background"
              >
                Menu
              </button>
            </div>
            <div />
            <div className="flex items-center justify-end gap-2">
              <img src="/brand/logowf.png" alt="Woodforest" className="h-10 w-10 rounded-lg object-contain" />
              <div className="min-w-0 text-right">
                <div className="truncate text-sm font-semibold text-foreground">Woodforest Admin</div>
                <div className="truncate text-xs text-muted capitalize">{roleLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-[76px] lg:py-6 lg:pt-6">

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden rounded-2xl border border-border bg-surface p-4 lg:block lg:sticky lg:top-6 lg:self-start">
            <div className="flex flex-col items-center gap-3 text-center">
              <img src="/brand/logowf.png" alt="Woodforest" className="h-40 w-40 rounded-lg object-contain" />
              <div>
                <div className="text-sm font-semibold text-foreground">Woodforest Admin</div>
                <div className="mt-0.5 text-xs text-muted capitalize">{roleLabel}</div>
              </div>
            </div>
            <div className="mt-4">
              <NavLinks />
            </div>

            <form action="/api/auth/logout" method="post" className="mt-6">
              <button
                type="submit"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Logout
              </button>
            </form>
          </aside>

          <main className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-6">{children}</main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div
            className="h-full w-[86%] max-w-xs overflow-y-auto bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">Menu</div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-background hover:text-foreground"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <img src="/brand/logowf.png" alt="Woodforest" className="h-16 w-16 rounded-xl object-contain" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">Woodforest Admin</div>
                <div className="truncate text-xs text-muted capitalize">{roleLabel}</div>
              </div>
            </div>

            <div className="mt-4">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>

            <form action="/api/auth/logout" method="post" className="mt-6">
              <button
                type="submit"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
