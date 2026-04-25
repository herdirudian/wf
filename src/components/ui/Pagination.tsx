"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function linkFor(nextPage: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(nextPage));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="text-sm text-primary/40">
        Halaman {page} / {totalPages} · Total {total}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={linkFor(Math.max(1, page - 1))}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-primary/5"
          aria-disabled={page <= 1}
        >
          Prev
        </Link>
        <Link
          href={linkFor(Math.min(totalPages, page + 1))}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-primary/5"
          aria-disabled={page >= totalPages}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

