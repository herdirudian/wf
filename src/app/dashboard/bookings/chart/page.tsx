import Link from "next/link";
import { BookingsBlockingChart } from "@/components/bookings/BookingsBlockingChart";

export default function BookingsChartPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Blocking Chart</h1>
          <p className="text-sm text-muted">Tampilan booking sebagai blok per unit.</p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Kembali
        </Link>
      </div>
      <BookingsBlockingChart />
    </div>
  );
}

