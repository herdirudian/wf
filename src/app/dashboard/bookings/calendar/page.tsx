import Link from "next/link";
import { OccupancyCalendar } from "@/components/bookings/OccupancyCalendar";

export default function BookingsCalendarPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Booking Calendar</h1>
          <p className="text-sm text-muted">Occupancy per hari per unit.</p>
        </div>
        <Link
          href="/dashboard/bookings"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Kembali
        </Link>
      </div>
      <OccupancyCalendar />
    </div>
  );
}

