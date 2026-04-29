import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDaysWIB, formatDateWIB, parseDateWIB } from "@/lib/time";
import { getDashboardMetrics, getReports } from "@/services/report.service";
import type { BookingStatus } from "@/services/booking.service";
import type { PaymentStatus } from "@/services/payment.service";
import { logActivity } from "@/services/activity.service";

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(","));
  return "\ufeff" + [header, ...lines].join("\r\n") + "\r\n";
}

function asDateRange(url: URL) {
  const startStr = url.searchParams.get("start") ?? undefined;
  const endStr = url.searchParams.get("end") ?? undefined;
  const start = startStr ? parseDateWIB(startStr) : undefined;
  const end = endStr ? addDaysWIB(parseDateWIB(endStr), 1) : undefined;
  return { startStr, endStr, start, end };
}

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const resource = (url.searchParams.get("resource") ?? "").toLowerCase();

  let csv = "";
  let filename = `export-${resource || "data"}.csv`;

  if (resource === "units") {
    const q = url.searchParams.get("q") ?? undefined;
    const unitType = url.searchParams.get("type") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;

    const where: Record<string, unknown> = {};
    if (q) where.name = { contains: q };
    if (unitType) where.type = unitType;
    if (category) where.category = category;

    const [units, addOns] = await Promise.all([
      prisma.unit.findMany({ where, orderBy: [{ type: "asc" }, { name: "asc" }], take: 10000 }),
      prisma.addOn.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const addOnNameById = new Map(addOns.map((a) => [a.id, a.name]));

    const rows = units.map((u) => ({
      id: u.id,
      name: u.name,
      type: u.type,
      category: u.category ?? "",
      kavlingScope: u.kavlingScope ?? "",
      isActive: u.isActive ? "true" : "false",
      capacity: u.capacity,
      totalUnits: u.totalUnits,
      priceWeekday: u.priceWeekday,
      priceWeekend: u.priceWeekend,
      autoAddOnMode: u.autoAddOnMode ?? "",
      autoAddOnId: u.autoAddOnId ?? "",
      autoAddOnName: u.autoAddOnId ? addOnNameById.get(u.autoAddOnId) ?? "" : "",
      createdAt: u.createdAt.toISOString(),
    }));

    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "name", label: "name" },
      { key: "type", label: "type" },
      { key: "category", label: "category" },
      { key: "kavlingScope", label: "kavlingScope" },
      { key: "isActive", label: "isActive" },
      { key: "capacity", label: "capacity" },
      { key: "totalUnits", label: "totalUnits" },
      { key: "priceWeekday", label: "priceWeekday" },
      { key: "priceWeekend", label: "priceWeekend" },
      { key: "autoAddOnMode", label: "autoAddOnMode" },
      { key: "autoAddOnId", label: "autoAddOnId" },
      { key: "autoAddOnName", label: "autoAddOnName" },
      { key: "createdAt", label: "createdAt" },
    ]);
    filename = `export-units.csv`;
  } else if (resource === "bookings") {
    const status = (url.searchParams.get("status") ?? undefined) as BookingStatus | undefined;
    const { startStr, endStr, start, end } = asDateRange(url);

    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(start || end
        ? {
            checkIn: end ? { lt: end } : undefined,
            checkOut: start ? { gt: start } : undefined,
          }
        : {}),
    };

    const items = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: {
        customer: true,
        payment: true,
        items: { include: { unit: true } },
        addOns: { include: { addOn: true } },
        kavlings: { include: { kavling: true } },
      },
    });

    const rows = items.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      checkIn: formatDateWIB(b.checkIn),
      checkOut: formatDateWIB(b.checkOut),
      totalGuest: b.totalGuest,
      customerName: b.customer.name,
      customerPhone: b.customer.phone,
      customerEmail: b.customer.email ?? "",
      items: b.items.map((x) => `${x.unit.name} x${x.quantity}`).join("; "),
      kavlings: b.kavlings.map((x) => x.kavling.number).sort((a, c) => a - c).join(", "),
      addOns: b.addOns.map((x) => `${x.addOn.name} x${x.quantity}`).join("; "),
      specialRequest: b.specialRequest ?? "",
      paymentStatus: b.payment?.status ?? "",
      paymentAmount: b.payment?.amount ?? 0,
      paymentPaidAmount: b.payment?.paidAmount ?? 0,
      paymentFeePaid: b.payment?.serviceFeeAmount ?? 0,
      paymentGrossPaid: (b.payment?.paidAmount ?? 0) + (b.payment?.serviceFeeAmount ?? 0),
      paymentMethod: b.payment?.method ?? "",
      checkoutUrl: b.payment?.checkoutUrl ?? "",
    }));

    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "code", label: "code" },
      { key: "status", label: "status" },
      { key: "createdAt", label: "createdAt" },
      { key: "checkIn", label: "checkIn" },
      { key: "checkOut", label: "checkOut" },
      { key: "totalGuest", label: "totalGuest" },
      { key: "customerName", label: "customerName" },
      { key: "customerPhone", label: "customerPhone" },
      { key: "customerEmail", label: "customerEmail" },
      { key: "items", label: "items" },
      { key: "kavlings", label: "kavlings" },
      { key: "addOns", label: "addOns" },
      { key: "specialRequest", label: "specialRequest" },
      { key: "paymentStatus", label: "paymentStatus" },
      { key: "paymentAmount", label: "paymentAmount" },
      { key: "paymentPaidAmount", label: "paymentPaidAmount" },
      { key: "paymentFeePaid", label: "paymentFeePaid" },
      { key: "paymentGrossPaid", label: "paymentGrossPaid" },
      { key: "paymentMethod", label: "paymentMethod" },
      { key: "checkoutUrl", label: "checkoutUrl" },
    ]);
    filename = `export-bookings${status ? `-${status}` : ""}${startStr ? `-${startStr}` : ""}${endStr ? `-${endStr}` : ""}.csv`;
  } else if (resource === "monitoring") {
    const items = await prisma.booking.findMany({
      where: {
        status: { not: "cancelled" },
        payment: { status: { not: "paid" } },
      },
      orderBy: { checkIn: "asc" },
      take: 10000,
      include: { customer: true, payment: true },
    });

    const rows = items.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      checkIn: formatDateWIB(b.checkIn),
      checkOut: formatDateWIB(b.checkOut),
      customerName: b.customer.name,
      customerPhone: b.customer.phone,
      customerEmail: b.customer.email ?? "",
      specialRequest: b.specialRequest ?? "",
      paymentStatus: b.payment?.status ?? "",
      paymentAmount: b.payment?.amount ?? 0,
      paymentPaidAmount: b.payment?.paidAmount ?? 0,
      paymentFeePaid: b.payment?.serviceFeeAmount ?? 0,
      paymentGrossPaid: (b.payment?.paidAmount ?? 0) + (b.payment?.serviceFeeAmount ?? 0),
      checkoutUrl: b.payment?.checkoutUrl ?? "",
      gatewayExpiresAt: b.payment?.gatewayExpiresAt ? b.payment.gatewayExpiresAt.toISOString() : "",
    }));

    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "code", label: "code" },
      { key: "status", label: "status" },
      { key: "createdAt", label: "createdAt" },
      { key: "checkIn", label: "checkIn" },
      { key: "checkOut", label: "checkOut" },
      { key: "customerName", label: "customerName" },
      { key: "customerPhone", label: "customerPhone" },
      { key: "customerEmail", label: "customerEmail" },
      { key: "specialRequest", label: "specialRequest" },
      { key: "paymentStatus", label: "paymentStatus" },
      { key: "paymentAmount", label: "paymentAmount" },
      { key: "paymentPaidAmount", label: "paymentPaidAmount" },
      { key: "paymentFeePaid", label: "paymentFeePaid" },
      { key: "paymentGrossPaid", label: "paymentGrossPaid" },
      { key: "checkoutUrl", label: "checkoutUrl" },
      { key: "gatewayExpiresAt", label: "gatewayExpiresAt" },
    ]);
    filename = `export-monitoring.csv`;
  } else if (resource === "payments") {
    const status = (url.searchParams.get("status") ?? undefined) as PaymentStatus | undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const items = await prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      take: 10000,
      include: { booking: { include: { customer: true } } },
    });

    const rows = items.map((p) => ({
      id: p.id,
      bookingCode: p.booking.code,
      customerName: p.booking.customer.name,
      customerPhone: p.booking.customer.phone,
      status: p.status,
      amount: p.amount,
      paidAmount: p.paidAmount,
      feePaid: p.serviceFeeAmount ?? 0,
      grossPaid: p.paidAmount + (p.serviceFeeAmount ?? 0),
      method: p.method ?? "",
      paidAt: p.paidAt ? p.paidAt.toISOString() : "",
      gateway: p.gateway ?? "",
      gatewayExternalId: p.gatewayExternalId ?? "",
      checkoutUrl: p.checkoutUrl ?? "",
      gatewayExpiresAt: p.gatewayExpiresAt ? p.gatewayExpiresAt.toISOString() : "",
      invoiceKind: p.invoiceKind ?? "",
      invoiceBaseAmount: p.invoiceBaseAmount ?? 0,
      invoiceFeeAmount: p.invoiceFeeAmount ?? 0,
      invoiceFeeBps: p.invoiceFeeBps ?? 0,
      invoiceFeeFlat: p.invoiceFeeFlat ?? 0,
    }));

    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "bookingCode", label: "bookingCode" },
      { key: "customerName", label: "customerName" },
      { key: "customerPhone", label: "customerPhone" },
      { key: "status", label: "status" },
      { key: "amount", label: "amount" },
      { key: "paidAmount", label: "paidAmount" },
      { key: "feePaid", label: "feePaid" },
      { key: "grossPaid", label: "grossPaid" },
      { key: "method", label: "method" },
      { key: "paidAt", label: "paidAt" },
      { key: "gateway", label: "gateway" },
      { key: "gatewayExternalId", label: "gatewayExternalId" },
      { key: "checkoutUrl", label: "checkoutUrl" },
      { key: "gatewayExpiresAt", label: "gatewayExpiresAt" },
      { key: "invoiceKind", label: "invoiceKind" },
      { key: "invoiceBaseAmount", label: "invoiceBaseAmount" },
      { key: "invoiceFeeAmount", label: "invoiceFeeAmount" },
      { key: "invoiceFeeBps", label: "invoiceFeeBps" },
      { key: "invoiceFeeFlat", label: "invoiceFeeFlat" },
    ]);
    filename = `export-payments${status ? `-${status}` : ""}.csv`;
  } else if (resource === "addons") {
    const items = await prisma.addOn.findMany({ orderBy: { name: "asc" }, take: 10000 });
    const rows = items.map((a) => ({ id: a.id, name: a.name, price: a.price }));
    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "name", label: "name" },
      { key: "price", label: "price" },
    ]);
    filename = `export-addons.csv`;
  } else if (resource === "ugc") {
    const items = await prisma.ugcHighlight.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: 10000 });
    const rows = items.map((x) => ({
      id: x.id,
      title: x.title,
      caption: x.caption ?? "",
      imageUrl: x.imageUrl ?? "",
      isActive: x.isActive ? "true" : "false",
      sortOrder: x.sortOrder,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString(),
    }));
    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "title", label: "title" },
      { key: "caption", label: "caption" },
      { key: "imageUrl", label: "imageUrl" },
      { key: "isActive", label: "isActive" },
      { key: "sortOrder", label: "sortOrder" },
      { key: "createdAt", label: "createdAt" },
      { key: "updatedAt", label: "updatedAt" },
    ]);
    filename = `export-ugc.csv`;
  } else if (resource === "customers") {
    const q = url.searchParams.get("q") ?? undefined;
    const where = q
      ? {
          OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }],
        }
      : {};
    const items = await prisma.customer.findMany({ where, orderBy: { name: "asc" }, take: 10000 });
    const rows = items.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email ?? "" }));
    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "name", label: "name" },
      { key: "phone", label: "phone" },
      { key: "email", label: "email" },
    ]);
    filename = `export-customers.csv`;
  } else if (resource === "reports") {
    const r = await getReports();
    const rows: Array<Record<string, unknown>> = [];
    for (const x of r.monthlyRevenue) rows.push({ section: "monthlyRevenue", key: x.ym, value: x.revenue });
    for (const x of r.bookingCount) rows.push({ section: "bookingCount", key: x.ym, value: x.count });
    for (const x of r.topUnits) rows.push({ section: "topUnits", key: x.name, value: x.quantity });
    csv = toCsv(rows, [
      { key: "section", label: "section" },
      { key: "key", label: "key" },
      { key: "value", label: "value" },
    ]);
    filename = `export-reports.csv`;
  } else if (resource === "settings") {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const rows = [
      {
        id: cfg?.id ?? 1,
        kavlingSellCount: cfg?.kavlingSellCount ?? 110,
        privateKavlingStart: cfg?.privateKavlingStart ?? 58,
        privateKavlingEnd: cfg?.privateKavlingEnd ?? 65,
        mandiriAutoAddOnId: cfg?.mandiriAutoAddOnId ?? "",
        holdMinutes: cfg?.holdMinutes ?? 5,
        balanceReminderDays: cfg?.balanceReminderDays ?? 7,
        smtpHost: cfg?.smtpHost ?? "",
        smtpPort: cfg?.smtpPort ?? "",
        smtpSecure: typeof cfg?.smtpSecure === "boolean" ? (cfg.smtpSecure ? "true" : "false") : "",
        smtpUser: cfg?.smtpUser ?? "",
        smtpFromName: cfg?.smtpFromName ?? "",
        paymentNotifyEmails: cfg?.paymentNotifyEmails ?? "",
        xenditSecretKeySet: cfg?.xenditSecretKey ? "true" : "false",
        xenditCallbackTokenSet: cfg?.xenditCallbackToken ? "true" : "false",
        smtpPasswordSet: cfg?.smtpPassword ? "true" : "false",
        updatedAt: cfg?.updatedAt ? cfg.updatedAt.toISOString() : "",
      },
    ];

    csv = toCsv(rows, [
      { key: "id", label: "id" },
      { key: "kavlingSellCount", label: "kavlingSellCount" },
      { key: "privateKavlingStart", label: "privateKavlingStart" },
      { key: "privateKavlingEnd", label: "privateKavlingEnd" },
      { key: "mandiriAutoAddOnId", label: "mandiriAutoAddOnId" },
      { key: "holdMinutes", label: "holdMinutes" },
      { key: "balanceReminderDays", label: "balanceReminderDays" },
      { key: "smtpHost", label: "smtpHost" },
      { key: "smtpPort", label: "smtpPort" },
      { key: "smtpSecure", label: "smtpSecure" },
      { key: "smtpUser", label: "smtpUser" },
      { key: "smtpFromName", label: "smtpFromName" },
      { key: "paymentNotifyEmails", label: "paymentNotifyEmails" },
      { key: "xenditSecretKeySet", label: "xenditSecretKeySet" },
      { key: "xenditCallbackTokenSet", label: "xenditCallbackTokenSet" },
      { key: "smtpPasswordSet", label: "smtpPasswordSet" },
      { key: "updatedAt", label: "updatedAt" },
    ]);
    filename = `export-settings.csv`;
  } else if (resource === "dashboard") {
    const m = await getDashboardMetrics();
    const rows: Array<Record<string, unknown>> = [
      { metric: "bookingToday", value: m.bookingToday },
      { metric: "revenueToday", value: m.revenueToday },
      { metric: "occupancyRate", value: m.occupancyRate },
      ...m.bookingsLast7Days.map((x) => ({ metric: `bookingsLast7Days:${x.date}`, value: x.count })),
    ];
    csv = toCsv(rows, [
      { key: "metric", label: "metric" },
      { key: "value", label: "value" },
    ]);
    filename = `export-dashboard.csv`;
  } else if (resource === "front-office") {
    const { startStr, start, end } = asDateRange(url);
    if (!start || !end) return NextResponse.json({ message: "Tanggal tidak valid" }, { status: 400 });

    const items = await prisma.booking.findMany({
      where: {
        status: { not: "cancelled" },
        checkIn: { gte: start, lt: end },
        payment: { status: { in: ["paid", "partial"] } },
      },
      orderBy: [{ checkIn: "asc" }, { code: "asc" }],
      include: {
        customer: true,
        payment: true,
        items: { include: { unit: true } },
        kavlings: { include: { kavling: true } },
      },
    });

    const rows = items.map((b) => ({
      code: b.code,
      status: b.status,
      customerName: b.customer.name,
      customerPhone: b.customer.phone,
      checkIn: formatDateWIB(b.checkIn),
      checkOut: formatDateWIB(b.checkOut),
      totalGuest: b.totalGuest,
      kavlings: b.kavlings.map((x) => x.kavling.number).sort((a, c) => a - c).join(", "),
      items: b.items.map((x) => `${x.unit.name} x${x.quantity}`).join("; "),
      paymentStatus: b.payment?.status ?? "",
      paymentAmount: b.payment?.amount ?? 0,
      paymentPaidAmount: b.payment?.paidAmount ?? 0,
      paymentMethod: b.payment?.method ?? "",
      checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : "-",
      checkedOutAt: b.checkedOutAt ? b.checkedOutAt.toISOString() : "-",
    }));

    csv = toCsv(rows, [
      { key: "code", label: "Booking Code" },
      { key: "status", label: "Status" },
      { key: "customerName", label: "Customer Name" },
      { key: "customerPhone", label: "Phone" },
      { key: "checkIn", label: "Check In" },
      { key: "checkOut", label: "Check Out" },
      { key: "totalGuest", label: "Guest" },
      { key: "kavlings", label: "Kavling" },
      { key: "items", label: "Units" },
      { key: "paymentStatus", label: "Payment" },
      { key: "paymentAmount", label: "Total Amount" },
      { key: "paymentPaidAmount", label: "Paid Amount" },
      { key: "paymentMethod", label: "Method" },
      { key: "checkedInAt", label: "Checked In At" },
      { key: "checkedOutAt", label: "Checked Out At" },
    ]);
    filename = `front-office-${startStr}.csv`;
  } else {
    return NextResponse.json({ message: "Resource tidak valid" }, { status: 400 });
  }

  await logActivity({
    adminUserId: session.adminUser.id,
    action: "EXPORT_CSV",
    resource: resource,
    payload: { filename },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
