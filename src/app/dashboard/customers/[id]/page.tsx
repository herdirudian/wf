import Link from "next/link";
import { prisma } from "@/lib/prisma";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { unit: true } },
          payment: true,
        },
      },
    },
  });

  if (!customer) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted">Customer tidak ditemukan.</div>
        <Link href="/dashboard/customers" className="text-sm text-foreground underline">
          Kembali
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{customer.name}</h1>
          <div className="mt-1 text-sm text-muted">
            {customer.phone} · {customer.email ?? "-"}
          </div>
        </div>
        <Link
          href="/dashboard/customers"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
        >
          Kembali
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-background text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {customer.bookings.map((b) => (
              <tr key={b.id} className="text-foreground">
                <td className="px-4 py-3 font-medium text-foreground">{b.code}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  <div>In: {iso(b.checkIn)}</div>
                  <div>Out: {iso(b.checkOut)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {b.items.map((x) => `${x.unit.name} x${x.quantity}`).join(", ")}
                </td>
                <td className="px-4 py-3">{b.status}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  <div>{b.payment?.status ?? "-"}</div>
                  <div className="text-muted">{b.payment?.amount ?? 0}</div>
                </td>
              </tr>
            ))}
            {customer.bookings.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                  Belum ada history booking
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

