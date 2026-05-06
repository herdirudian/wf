import { prisma } from "@/lib/prisma";
import { startOfDayWIB, addDaysWIB, formatDateWIB } from "@/lib/time";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InHousePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateStr } = await searchParams;
  const todayStr = formatDateWIB(new Date());
  const date = dateStr ? dateStr : todayStr;
  
  const targetDate = startOfDayWIB(new Date(date));

  const inHouse = await prisma.booking.findMany({
    where: {
      checkIn: { lte: targetDate },
      checkOut: { gt: targetDate },
      status: { in: ["checked_in", "paid", "partial"] },
    },
    include: {
      customer: true,
      items: { include: { unit: true } },
      kavlings: { include: { kavling: true } },
    },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/dashboard/reports" className="text-xs font-bold text-primary hover:underline">← Kembali ke Reports</Link>
          <h1 className="text-2xl font-bold text-foreground">Guest In-House</h1>
          <p className="text-sm text-muted">Daftar tamu yang sedang menginap (In-House).</p>
        </div>
        <form className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted">Pilih Tanggal</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="h-10 rounded-xl border border-border bg-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button className="h-10 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-sm hover:bg-primary/90 transition-all active:scale-95">Filter</button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted">
              <tr>
                <th className="px-6 py-4">Booking</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Unit / Kavling</th>
                <th className="px-6 py-4">Tamu</th>
                <th className="px-6 py-4">Masa Inap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inHouse.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted italic">Tidak ada tamu in-house untuk tanggal ini.</td>
                </tr>
              ) : (
                inHouse.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/5">
                    <td className="px-6 py-4 font-bold">{b.code}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{b.customer.name}</div>
                      <div className="text-xs text-muted">{b.customer.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{b.items.map(it => `${it.unit.name} x${it.quantity}`).join(", ")}</div>
                      <div className="text-xs text-primary font-bold">Kavling: {b.kavlings.map(k => k.kavling.number).sort((a,c) => a-c).join(", ")}</div>
                    </td>
                    <td className="px-6 py-4">{b.totalGuest} Orang</td>
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        In: <span className="font-bold">{formatDateWIB(b.checkIn)}</span>
                      </div>
                      <div className="text-xs text-muted">
                        Out: <span className="font-bold">{formatDateWIB(b.checkOut)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
