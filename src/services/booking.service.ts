import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { addDaysWIB, formatDateWIB, nightDatesWIB, startOfDayWIB } from "@/lib/time";

export type BookingStatus = "pending" | "paid" | "checked_in" | "cancelled" | "completed";

export type ListBookingsInput = {
  page: number;
  pageSize: number;
  status?: BookingStatus;
  start?: Date;
  end?: Date;
};

export async function listBookings(input: ListBookingsInput) {
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.start || input.end
      ? {
          checkIn: input.end ? { lt: input.end } : undefined,
          checkOut: input.start ? { gt: input.start } : undefined,
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        customer: true,
        items: { include: { unit: true } },
        kavlings: { include: { kavling: true, unit: true } },
        payment: true,
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return { items, total, page: input.page, pageSize: input.pageSize };
}

export async function getBookingById(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { unit: true } },
      payment: true,
      addOns: { include: { addOn: true } },
      kavlings: { include: { kavling: true } },
    },
  });
}

export async function getBookingByCode(code: string) {
  return prisma.booking.findUnique({
    where: { code },
    include: {
      customer: true,
      items: { include: { unit: true } },
      payment: true,
      addOns: { include: { addOn: true } },
      kavlings: { include: { kavling: true } },
    },
  });
}

function canTransition(from: BookingStatus, to: BookingStatus) {
  if (from === "pending") return to === "paid" || to === "cancelled";
  if (from === "paid") return to === "checked_in" || to === "completed" || to === "cancelled";
  if (from === "checked_in") return to === "completed" || to === "cancelled";
  return false;
}

export async function updateBookingStatus(id: string, nextStatus: BookingStatus) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new Error("Booking tidak ditemukan");

  const current = booking.status as BookingStatus;
  if (!canTransition(current, nextStatus)) {
    throw new Error(`Transisi status tidak valid: ${current} -> ${nextStatus}`);
  }

  return prisma.booking.update({
    where: { id },
    data: { status: nextStatus },
  });
}

function dateKey(d: Date) {
  return formatDateWIB(d);
}

async function lockKavlings(tx: { $queryRawUnsafe: (...args: any[]) => Promise<unknown> }, kavlingIds: string[]) {
  if (!kavlingIds.length) return;
  const placeholders = kavlingIds.map(() => "?").join(", ");
  await tx.$queryRawUnsafe("SELECT id FROM Kavling WHERE id IN (" + placeholders + ") FOR UPDATE", ...kavlingIds);
}

function startOfDate(d: Date) {
  return startOfDayWIB(d);
}

function addDays(d: Date, days: number) {
  return addDaysWIB(d, days);
}

function nightDates(checkIn: Date, checkOut: Date) {
  return nightDatesWIB(checkIn, checkOut);
}

function isWeekend(d: Date) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short" }).format(d);
  return wd === "Sat" || wd === "Sun";
}

async function getDailyRatesMap(params: { unitIds: string[]; checkIn: Date; checkOut: Date }) {
  const start = startOfDate(params.checkIn);
  const end = startOfDate(params.checkOut);
  const rows = await prisma.unitDailyRate.findMany({
    where: {
      unitId: { in: params.unitIds },
      date: { gte: start, lt: end },
    },
    select: { unitId: true, date: true, price: true, allotment: true },
  });

  const map = new Map<string, { price: number; allotment: number }>();
  for (const r of rows) {
    map.set(`${r.unitId}|${dateKey(r.date)}`, { price: r.price, allotment: r.allotment });
  }
  return map;
}

async function getBookedByDateMap(params: { unitIds: string[]; checkIn: Date; checkOut: Date; excludeBookingId?: string }) {
  const rows = await prisma.bookingItem.findMany({
    where: {
      unitId: { in: params.unitIds },
      booking: {
        ...(params.excludeBookingId ? { id: { not: params.excludeBookingId } } : {}),
        status: { not: "cancelled" },
        checkIn: { lt: params.checkOut },
        checkOut: { gt: params.checkIn },
      },
    },
    select: {
      unitId: true,
      quantity: true,
      booking: { select: { checkIn: true, checkOut: true } },
    },
  });

  const booked = new Map<string, number>();
  for (const it of rows) {
    const overlapStart = it.booking.checkIn > params.checkIn ? it.booking.checkIn : params.checkIn;
    const overlapEnd = it.booking.checkOut < params.checkOut ? it.booking.checkOut : params.checkOut;
    const dates = nightDates(overlapStart, overlapEnd);
    for (const d of dates) {
      const k = `${it.unitId}|${dateKey(d)}`;
      booked.set(k, (booked.get(k) ?? 0) + it.quantity);
    }
  }
  return booked;
}

export async function assertAvailabilityForItems(params: {
  checkIn: Date;
  checkOut: Date;
  items: Array<{ unitId: string; quantity: number }>;
  excludeBookingId?: string;
}) {
  const dates = nightDates(params.checkIn, params.checkOut);
  if (!dates.length) throw new Error("Tanggal check-out harus setelah check-in");

  const unitIds = [...new Set(params.items.map((x) => x.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } } });
  const unitById = new Map(units.map((u) => [u.id, u]));

  const [dailyRates, booked] = await Promise.all([
    getDailyRatesMap({ unitIds, checkIn: params.checkIn, checkOut: params.checkOut }),
    getBookedByDateMap({
      unitIds,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      excludeBookingId: params.excludeBookingId,
    }),
  ]);

  for (const req of params.items) {
    const u = unitById.get(req.unitId);
    if (!u) throw new Error("Unit tidak ditemukan");

    for (const d of dates) {
      const k = `${req.unitId}|${dateKey(d)}`;
      const used = booked.get(k) ?? 0;
      const rate = dailyRates.get(k);
      const allotment = rate?.allotment ?? u.totalUnits;
      if (used + req.quantity > allotment) {
        const sisa = Math.max(0, allotment - used);
        throw new Error(`Unit "${u.name}" tidak tersedia pada ${dateKey(d)}. Sisa: ${sisa}`);
      }
    }
  }
}

function bookingCode() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `WFJ-${y}${m}${day}-${rand}`;
}

async function getKavlingConfig(tx: typeof prisma) {
  const cfg = await tx.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null, holdMinutes: 5 },
    update: {},
  });
  return {
    sellCount: cfg.kavlingSellCount,
    privateStart: cfg.privateKavlingStart,
    privateEnd: cfg.privateKavlingEnd,
    mandiriAutoAddOnId: cfg.mandiriAutoAddOnId,
  };
}

async function calcBaseAmountDaily(params: {
  checkIn: Date;
  checkOut: Date;
  items: Array<{ unitId: string; quantity: number }>;
}) {
  const dates = nightDates(params.checkIn, params.checkOut);
  if (!dates.length) throw new Error("Tanggal check-out harus setelah check-in");

  const unitIds = [...new Set(params.items.map((x) => x.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } } });
  const unitById = new Map(units.map((u) => [u.id, u]));
  const dailyRates = await getDailyRatesMap({ unitIds, checkIn: params.checkIn, checkOut: params.checkOut });

  let amount = 0;
  for (const it of params.items) {
    const u = unitById.get(it.unitId);
    if (!u) throw new Error("Unit tidak ditemukan");
    for (const d of dates) {
      const k = `${it.unitId}|${dateKey(d)}`;
      const rate = dailyRates.get(k);
      const price = rate?.price ?? (isWeekend(d) ? u.priceWeekend : u.priceWeekday);
      amount += it.quantity * price;
    }
  }
  return amount;
}

export async function getAvailability(params: { checkIn: Date; checkOut: Date; type?: string }) {
  const dates = nightDates(params.checkIn, params.checkOut);
  if (!dates.length) throw new Error("Tanggal check-out harus setelah check-in");

  const [units, addOns] = await Promise.all([
    prisma.unit.findMany({
      where: {
        isActive: true,
        ...(params.type ? { type: params.type } : {}),
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.addOn.findMany({ orderBy: { name: "asc" } }),
  ]);

  const unitIds = units.map((u) => u.id);
  const [dailyRates, booked] = await Promise.all([
    unitIds.length ? getDailyRatesMap({ unitIds, checkIn: params.checkIn, checkOut: params.checkOut }) : Promise.resolve(new Map()),
    unitIds.length ? getBookedByDateMap({ unitIds, checkIn: params.checkIn, checkOut: params.checkOut }) : Promise.resolve(new Map()),
  ]);

  const availableUnits = units.map((u) => {
    let minAvail = u.totalUnits;
    const daily = dates.map((d) => {
      const k = `${u.id}|${dateKey(d)}`;
      const rate = dailyRates.get(k);
      const allotment = rate?.allotment ?? u.totalUnits;
      const used = booked.get(k) ?? 0;
      const available = Math.max(0, allotment - used);
      minAvail = Math.min(minAvail, available);
      const price = rate?.price ?? (isWeekend(d) ? u.priceWeekend : u.priceWeekday);
      return { date: dateKey(d), price, allotment, booked: used, available };
    });

    return {
      ...u,
      available: Math.max(0, minAvail),
      daily,
    };
  });

  return { units: availableUnits, addOns };
}

export async function createPublicBooking(input: {
  customer: { name: string; phone: string; email: string };
  specialRequest?: string | null;
  checkIn: Date;
  checkOut: Date;
  totalGuest: number;
  adultPax?: number;
  childPax?: number;
  kavlings?: number[];
  hold?: { id: string; token: string };
  items: Array<{ unitId: string; quantity: number }>;
  addOns: Array<{ addOnId: string; quantity: number }>;
}) {
  if (input.checkOut <= input.checkIn) throw new Error("Tanggal check-out harus setelah check-in");
  if (!input.items.length) throw new Error("Pilih minimal 1 unit");

  const items = input.items.filter((x) => x.quantity > 0);
  if (!items.length) throw new Error("Pilih minimal 1 unit");

  const unitIds = [...new Set(items.map((x) => x.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds }, isActive: true } });
  const unitById = new Map(units.map((u) => [u.id, u]));
  if (units.length !== unitIds.length) throw new Error("Ada unit yang nonaktif atau tidak ditemukan");

  const capacityTotal = items.reduce((acc, it) => acc + (unitById.get(it.unitId)?.capacity ?? 0) * it.quantity, 0);
  if (input.totalGuest <= 0) throw new Error("Total guest tidak valid");

  const guestToValidate = input.adultPax ?? input.totalGuest;
  if (capacityTotal > 0 && guestToValidate > capacityTotal) {
    throw new Error(`Jumlah tamu dewasa melebihi kapasitas. Maks: ${capacityTotal}`);
  }

  await assertAvailabilityForItems({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    items,
  });

  const cfg = await getKavlingConfig(prisma);
  const privateStart = Math.max(1, Math.min(cfg.privateStart, cfg.sellCount));
  const privateEnd = Math.max(privateStart, Math.min(cfg.privateEnd, cfg.sellCount));
  function deriveCategoryFromUnit(u: { category: string | null; name: string; kavlingScope?: string | null }) {
    const scope = (u.kavlingScope ?? "").toLowerCase();
    if (scope === "private") return "private";
    if (scope === "mandiri") return "mandiri";
    if (scope === "paket") return "paket";
    const raw = (u.category ?? "").toLowerCase();
    if (raw.includes("private")) return "private";
    if (raw.includes("mandiri") || raw.includes("kavling")) return "mandiri";
    if (raw.includes("paket")) return "paket";
    const n = u.name.toLowerCase();
    if (n.includes("private")) return "private";
    if (n.includes("mandiri") || n.includes("kavling")) return "mandiri";
    if (n.startsWith("paket ")) return "paket";
    return "unit";
  }

  const mandiriItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "mandiri");
  const privateItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "private");
  const paketItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "paket");
  const mandiriRequired = mandiriItems.reduce((acc, it) => acc + it.quantity, 0);
  const privateRequired = privateItems.reduce((acc, it) => acc + it.quantity, 0);
  const paketRequired = paketItems.reduce((acc, it) => acc + it.quantity, 0);

  const addOns = (() => {
    const base = input.addOns.filter((x) => x.quantity > 0);
    const map = new Map<string, number>();
    for (const it of base) map.set(it.addOnId, (map.get(it.addOnId) ?? 0) + it.quantity);
    for (const it of items) {
      const u = unitById.get(it.unitId) as unknown as { autoAddOnId?: string | null; autoAddOnMode?: string | null };
      const addOnId = u.autoAddOnId ?? "";
      const mode = (u.autoAddOnMode ?? "") as "per_pax" | "per_unit" | "per_booking" | "";
      if (!addOnId || !mode) continue;
      if (mode === "per_pax") map.set(addOnId, Math.max(map.get(addOnId) ?? 0, input.totalGuest));
      else if (mode === "per_unit") map.set(addOnId, (map.get(addOnId) ?? 0) + it.quantity);
      else if (mode === "per_booking") map.set(addOnId, (map.get(addOnId) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([addOnId, quantity]) => ({ addOnId, quantity }));
  })();

  const addOnIds = [...new Set(addOns.map((x) => x.addOnId))];
  const addOnRows = addOnIds.length ? await prisma.addOn.findMany({ where: { id: { in: addOnIds } } }) : [];
  if (addOnRows.length !== addOnIds.length) throw new Error("Ada add-on yang tidak ditemukan");
  const addOnById = new Map(addOnRows.map((a) => [a.id, a]));

  const baseAmount = await calcBaseAmountDaily({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    items: items.map((it) => ({ unitId: it.unitId, quantity: it.quantity })),
  });

  const addOnAmount = addOns.reduce((acc, it) => acc + (addOnById.get(it.addOnId)?.price ?? 0) * it.quantity, 0);
  const amount = baseAmount + addOnAmount;
  const requestedKavlings = (input.kavlings ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const totalKavlingRequired = mandiriRequired + paketRequired + privateRequired;
  const nonPrivateKavlingRequired = mandiriRequired + paketRequired;
  if (!totalKavlingRequired && requestedKavlings.length) {
    throw new Error("Kavling hanya untuk paket atau camping mandiri");
  }
  if (totalKavlingRequired) {
    const unique = Array.from(new Set(requestedKavlings));
    unique.sort((a, b) => a - b);
    if (unique.length !== requestedKavlings.length) throw new Error("Nomor kavling duplikat");
    if (unique.length !== totalKavlingRequired) throw new Error(`Jumlah kavling harus ${totalKavlingRequired}`);
    if (unique.some((n) => n < 1 || n > cfg.sellCount)) throw new Error(`Nomor kavling harus 1 - ${cfg.sellCount}`);

    const privateNums = unique.filter((n) => n >= privateStart && n <= privateEnd);
    const nonPrivateNums = unique.filter((n) => n < privateStart || n > privateEnd);
    if (privateNums.length !== privateRequired) {
      throw new Error(`Jumlah kavling Paket Private harus ${privateRequired}`);
    }
    if (nonPrivateNums.length !== nonPrivateKavlingRequired) {
      throw new Error(`Jumlah kavling Paket/Camping Mandiri harus ${nonPrivateKavlingRequired}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email ? String(input.customer.email) : null,
      },
    });

    const booking = await tx.booking.create({
      data: {
        code: bookingCode(),
        customerId: customer.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        totalGuest: input.totalGuest,
        status: "pending",
        specialRequest: input.specialRequest ?? null,
        items: {
          create: items.map((it) => ({ unitId: it.unitId, quantity: it.quantity })),
        },
        addOns: {
          create: addOns.map((it) => ({ addOnId: it.addOnId, quantity: it.quantity })),
        },
        payment: {
          create: { amount, status: "pending" },
        },
      },
    });

    if (mandiriRequired || paketRequired || privateRequired) {
      const unique = Array.from(new Set(requestedKavlings));
      unique.sort((a, b) => a - b);
      const required = mandiriRequired + paketRequired + privateRequired;
      const requiredNonPrivate = mandiriRequired + paketRequired;
      if (unique.length !== required) throw new Error(`Jumlah kavling harus ${required}`);

      const privateNums = unique.filter((n) => n >= privateStart && n <= privateEnd);
      const nonPrivateNums = unique.filter((n) => n < privateStart || n > privateEnd);
      if (privateNums.length !== privateRequired) throw new Error(`Jumlah kavling Paket Private harus ${privateRequired}`);
      if (nonPrivateNums.length !== requiredNonPrivate) throw new Error(`Jumlah kavling Paket/Camping Mandiri harus ${requiredNonPrivate}`);

      const mandiriUnitIds = mandiriRequired ? Array.from(new Set(mandiriItems.map((x) => x.unitId))) : [];
      const paketUnitIds = paketRequired ? Array.from(new Set(paketItems.map((x) => x.unitId))) : [];
      const privateUnitIds = privateRequired ? Array.from(new Set(privateItems.map((x) => x.unitId))) : [];
      if (mandiriUnitIds.length > 1) throw new Error("Pilih 1 item Camping Mandiri saja untuk pemilihan kavling");
      if (paketUnitIds.length > 1) throw new Error("Pilih 1 item Paket saja untuk pemilihan kavling");
      if (privateUnitIds.length > 1) throw new Error("Pilih 1 item Paket Private saja untuk pemilihan kavling");

      if (input.hold?.id && input.hold?.token) {
        const now = new Date();
        const hold = await tx.kavlingHold.findFirst({
          where: {
            id: input.hold.id,
            token: input.hold.token,
            expiresAt: { gt: now },
          },
          include: { kavlings: { include: { kavling: true } } },
        });
        if (!hold) throw new Error("Hold kavling tidak valid atau sudah expired");
        if (hold.checkIn.getTime() !== input.checkIn.getTime() || hold.checkOut.getTime() !== input.checkOut.getTime()) {
          throw new Error("Hold kavling tidak sesuai tanggal");
        }
        const expectedScope =
          privateRequired && (mandiriRequired || paketRequired)
            ? "mixed"
            : privateRequired
              ? "private"
              : mandiriRequired && paketRequired
                ? "paket"
                : mandiriRequired
                  ? "mandiri"
                  : "paket";
        if (hold.scope !== expectedScope) throw new Error("Hold kavling tidak sesuai kategori");
        const holdNums = hold.kavlings.map((x) => x.kavling.number).sort((a, b) => a - b);
        if (holdNums.length !== unique.length || holdNums.some((n, i) => n !== unique[i])) {
          throw new Error("Hold kavling tidak sesuai pilihan");
        }
      }

      await tx.kavling.createMany({
        data: unique.map((number) => ({ number })),
        skipDuplicates: true,
      });

      const kavlings = await tx.kavling.findMany({ where: { number: { in: unique } } });
      if (kavlings.length !== unique.length) throw new Error("Ada nomor kavling yang tidak valid");
      const kavlingByNumber = new Map(kavlings.map((k) => [k.number, k]));
      const kavlingIds = unique.map((n) => kavlingByNumber.get(n)!.id);

      await lockKavlings(tx, kavlingIds);

      const conflicts = await tx.bookingKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          booking: {
            status: { not: "cancelled" },
            checkIn: { lt: input.checkOut },
            checkOut: { gt: input.checkIn },
          },
        },
        include: { kavling: true },
      });
      if (conflicts.length) {
        const used = Array.from(new Set(conflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sudah terpakai pada tanggal tersebut: ${used.join(", ")}`);
      }

      const now = new Date();
      const holdConflicts = await tx.kavlingHoldKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          hold: {
            expiresAt: { gt: now },
            checkIn: { lt: input.checkOut },
            checkOut: { gt: input.checkIn },
            ...(input.hold?.id ? { id: { not: input.hold.id } } : {}),
          },
        },
        include: { kavling: true },
      });
      if (holdConflicts.length) {
        const used = Array.from(new Set(holdConflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sedang di-hold: ${used.join(", ")}`);
      }

      const assigned = (() => {
        const rows: Array<{ unitId: string; numbers: number[] }> = [];
        if (privateRequired) rows.push({ unitId: privateUnitIds[0]!, numbers: privateNums });
        if (paketRequired) rows.push({ unitId: paketUnitIds[0]!, numbers: nonPrivateNums.slice(0, paketRequired) });
        if (mandiriRequired) rows.push({ unitId: mandiriUnitIds[0]!, numbers: nonPrivateNums.slice(paketRequired) });
        return rows;
      })();

      const createRows = assigned.flatMap((a) =>
        a.numbers.map((n) => ({
          bookingId: booking.id,
          unitId: a.unitId,
          kavlingId: kavlingByNumber.get(n)!.id,
        })),
      );

      await tx.bookingKavling.createMany({ data: createRows });

      if (input.hold?.id && input.hold?.token) {
        await tx.kavlingHold.deleteMany({ where: { id: input.hold.id, token: input.hold.token } });
      }
    }

    return { bookingId: booking.id, code: booking.code, amount };
  });
}

export async function rescheduleBooking(
  id: string,
  checkIn: Date,
  checkOut: Date,
  opts?: { kavlingsByUnit?: Record<string, number[]> },
) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { items: true, kavlings: { include: { kavling: true } } },
  });
  if (!booking) throw new Error("Booking tidak ditemukan");
  const booking0 = booking;
  if (booking.status === "cancelled") throw new Error("Booking sudah dibatalkan");
  if (checkOut <= checkIn) throw new Error("Tanggal check-out harus setelah check-in");

  await assertAvailabilityForItems({
    checkIn,
    checkOut,
    items: booking0.items.map((x) => ({ unitId: x.unitId, quantity: x.quantity })),
    excludeBookingId: id,
  });

  const existingByUnit = booking0.kavlings.reduce<Record<string, number[]>>((acc, r) => {
    (acc[r.unitId] ??= []).push(r.kavling.number);
    return acc;
  }, {});
  for (const k of Object.keys(existingByUnit)) existingByUnit[k].sort((a, b) => a - b);

  const desiredByUnit: Record<string, number[] | undefined> = { ...existingByUnit };
  const incoming = opts?.kavlingsByUnit ?? {};
  for (const [unitId, numbers] of Object.entries(incoming)) desiredByUnit[unitId] = numbers;

  const seenAcross = new Set<number>();
  for (const [unitId, numbers] of Object.entries(desiredByUnit)) {
    if (!numbers?.length) continue;
    for (const n of numbers) {
      if (seenAcross.has(n)) throw new Error(`Nomor kavling duplikat: ${n}`);
      seenAcross.add(n);
    }
  }

  function reqQtyForUnit(unitId: string) {
    return booking0.items.filter((x) => x.unitId === unitId).reduce((acc, x) => acc + x.quantity, 0);
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { checkIn, checkOut } });

    const cfg = await getKavlingConfig(tx as unknown as typeof prisma);
    const privateStart = Math.max(1, Math.min(cfg.privateStart, cfg.sellCount));
    const privateEnd = Math.max(privateStart, Math.min(cfg.privateEnd, cfg.sellCount));

    const unitIds = Object.keys(desiredByUnit).filter((unitId) => (desiredByUnit[unitId] ?? []).length > 0);
    const units = unitIds.length
      ? await tx.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, category: true, name: true, kavlingScope: true } })
      : [];
    const unitById = new Map(units.map((u) => [u.id, u]));

    function scopeFromUnit(u: { category: string | null; name: string; kavlingScope: string | null }) {
      const scope = (u.kavlingScope ?? "").toLowerCase();
      if (scope === "private") return "private";
      if (scope === "mandiri") return "mandiri";
      if (scope === "paket") return "paket";
      const raw = (u.category ?? "").toLowerCase();
      const n = u.name.toLowerCase();
      if (raw.includes("private") || n.includes("private")) return "private";
      if (raw.includes("mandiri") || raw.includes("kavling") || n.includes("mandiri") || n.includes("kavling")) return "mandiri";
      return "paket";
    }

    for (const unitId of unitIds) {
      const numbers = desiredByUnit[unitId] ?? [];
      if (!numbers.length) continue;
      const reqQty = reqQtyForUnit(unitId);
      if (reqQty <= 0) continue;

      const unique = Array.from(new Set(numbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))));
      unique.sort((a, b) => a - b);
      if (unique.length !== numbers.length) throw new Error("Nomor kavling duplikat");
      if (unique.length !== reqQty) throw new Error(`Jumlah kavling harus ${reqQty}`);

      const unit = unitById.get(unitId);
      if (!unit) throw new Error("Unit tidak ditemukan");
      const scope = scopeFromUnit(unit);

      if (scope === "private") {
        if (unique.some((n) => n < privateStart || n > privateEnd)) {
          throw new Error(`Nomor kavling Paket Private harus ${privateStart} - ${privateEnd}`);
        }
      } else {
        if (unique.some((n) => n < 1 || n > cfg.sellCount)) throw new Error(`Nomor kavling harus 1 - ${cfg.sellCount}`);
        if (unique.some((n) => n >= privateStart && n <= privateEnd)) {
          throw new Error(`Range ${privateStart} - ${privateEnd} khusus untuk Paket Private`);
        }
      }

      await tx.kavling.createMany({ data: unique.map((number) => ({ number })), skipDuplicates: true });
      const kavlings = await tx.kavling.findMany({ where: { number: { in: unique } } });
      if (kavlings.length !== unique.length) throw new Error("Ada nomor kavling yang tidak valid");
      const kavlingByNumber = new Map(kavlings.map((k) => [k.number, k]));
      const kavlingIds = unique.map((n) => kavlingByNumber.get(n)!.id);

      await lockKavlings(tx as unknown as { $queryRawUnsafe: (...args: any[]) => Promise<unknown> }, kavlingIds);

      const conflicts = await tx.bookingKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          bookingId: { not: booking0.id },
          booking: {
            status: { not: "cancelled" },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
        },
        include: { booking: { select: { code: true, customer: { select: { name: true } } } }, kavling: true },
      });
      if (conflicts.length) {
        const nums = Array.from(new Set(conflicts.map((c) => c.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sudah terpakai pada tanggal baru: ${nums.join(", ")}`);
      }

      const now = new Date();
      const holdConflicts = await tx.kavlingHoldKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          hold: {
            expiresAt: { gt: now },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
        },
        include: { kavling: true },
      });
      if (holdConflicts.length) {
        const nums = Array.from(new Set(holdConflicts.map((c) => c.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sedang di-hold pada tanggal baru: ${nums.join(", ")}`);
      }

      await tx.bookingKavling.deleteMany({ where: { bookingId: booking0.id, unitId } });
      await tx.bookingKavling.createMany({
        data: unique.map((n) => ({ bookingId: booking0.id, unitId, kavlingId: kavlingByNumber.get(n)!.id })),
      });
    }
  });

  return prisma.booking.findUnique({
    where: { id },
    include: { items: true, kavlings: { include: { kavling: true } } },
  });
}

export async function getKavlingContext(params: { bookingId: string; unitId: string; range?: { checkIn: Date; checkOut: Date } }) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { items: true },
  });
  if (!booking) throw new Error("Booking tidak ditemukan");

  const reqQty = booking.items
    .filter((x) => x.unitId === params.unitId)
    .reduce((acc, x) => acc + x.quantity, 0);
  if (reqQty <= 0) throw new Error("Booking tidak memiliki item untuk unit ini");

  const assignedRows = await prisma.bookingKavling.findMany({
    where: { bookingId: booking.id, unitId: params.unitId },
    include: { kavling: true },
    orderBy: { kavling: { number: "asc" } },
  });
  const assigned = assignedRows.map((x) => x.kavling.number);

  const rangeCheckIn = params.range?.checkIn ?? booking.checkIn;
  const rangeCheckOut = params.range?.checkOut ?? booking.checkOut;

  const takenRows = await prisma.bookingKavling.findMany({
    where: {
      bookingId: { not: booking.id },
      booking: {
        status: { not: "cancelled" },
        checkIn: { lt: rangeCheckOut },
        checkOut: { gt: rangeCheckIn },
      },
    },
    include: { kavling: true, booking: { select: { code: true, customer: { select: { name: true } } } } },
  });
  const takenMeta = new Map<number, string>();
  for (const r of takenRows) {
    const label = `${r.booking.code} - ${r.booking.customer.name}`;
    takenMeta.set(r.kavling.number, label);
  }

  const now = new Date();
  const holdRows = await prisma.kavlingHoldKavling.findMany({
    where: {
      hold: {
        expiresAt: { gt: now },
        checkIn: { lt: rangeCheckOut },
        checkOut: { gt: rangeCheckIn },
      },
    },
    include: { kavling: true, hold: { select: { scope: true } } },
  });
  for (const r of holdRows) {
    if (!takenMeta.has(r.kavling.number)) takenMeta.set(r.kavling.number, `HOLD (${r.hold.scope})`);
  }

  const taken = Array.from(takenMeta.keys()).sort((a, b) => a - b);
  const takenBy = Object.fromEntries(Array.from(takenMeta.entries()).sort((a, b) => a[0] - b[0]));

  return {
    required: reqQty,
    assigned,
    taken,
    takenBy,
    range: { checkIn: formatDateWIB(rangeCheckIn), checkOut: formatDateWIB(rangeCheckOut) },
  };
}

export async function setKavlingAssignment(params: { bookingId: string; unitId: string; numbers: number[] }) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { items: true },
  });
  if (!booking) throw new Error("Booking tidak ditemukan");

  const reqQty = booking.items
    .filter((x) => x.unitId === params.unitId)
    .reduce((acc, x) => acc + x.quantity, 0);
  if (reqQty <= 0) throw new Error("Booking tidak memiliki item untuk unit ini");

  const cfg = await getKavlingConfig(prisma);
  const privateStart = Math.max(1, Math.min(cfg.privateStart, cfg.sellCount));
  const privateEnd = Math.max(privateStart, Math.min(cfg.privateEnd, cfg.sellCount));

  const unit = await prisma.unit.findUnique({
    where: { id: params.unitId },
    select: { category: true, name: true, kavlingScope: true },
  });
  if (!unit) throw new Error("Unit tidak ditemukan");

  function scopeFromUnit(u: { category: string | null; name: string; kavlingScope: string | null }) {
    const scope = (u.kavlingScope ?? "").toLowerCase();
    if (scope === "private") return "private";
    if (scope === "mandiri") return "mandiri";
    if (scope === "paket") return "paket";
    const raw = (u.category ?? "").toLowerCase();
    const n = u.name.toLowerCase();
    if (raw.includes("private") || n.includes("private")) return "private";
    if (raw.includes("mandiri") || raw.includes("kavling") || n.includes("mandiri") || n.includes("kavling")) return "mandiri";
    return "paket";
  }

  const scope = scopeFromUnit(unit);
  const unique = Array.from(new Set(params.numbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))));
  unique.sort((a, b) => a - b);
  if (unique.length !== params.numbers.length) throw new Error("Nomor kavling duplikat");
  if (unique.length !== reqQty) throw new Error(`Jumlah kavling harus ${reqQty}`);
  if (scope === "private") {
    if (unique.some((n) => n < privateStart || n > privateEnd)) {
      throw new Error(`Nomor kavling Paket Private harus ${privateStart} - ${privateEnd}`);
    }
  } else {
    if (unique.some((n) => n < 1 || n > cfg.sellCount)) throw new Error(`Nomor kavling harus 1 - ${cfg.sellCount}`);
    if (unique.some((n) => n >= privateStart && n <= privateEnd)) {
      throw new Error(`Range ${privateStart} - ${privateEnd} khusus untuk Paket Private`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.kavling.createMany({
      data: unique.map((number) => ({ number })),
      skipDuplicates: true,
    });

    const kavlings = await tx.kavling.findMany({ where: { number: { in: unique } } });
    if (kavlings.length !== unique.length) throw new Error("Ada nomor kavling yang tidak valid");
    const kavlingByNumber = new Map(kavlings.map((k) => [k.number, k]));
    const kavlingIds = unique.map((n) => kavlingByNumber.get(n)!.id);

    await lockKavlings(tx, kavlingIds);

    const conflicts = await tx.bookingKavling.findMany({
      where: {
        kavlingId: { in: kavlingIds },
        bookingId: { not: booking.id },
        booking: {
          status: { not: "cancelled" },
          checkIn: { lt: booking.checkOut },
          checkOut: { gt: booking.checkIn },
        },
      },
      include: { kavling: true },
    });
    if (conflicts.length) {
      const used = Array.from(new Set(conflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
      throw new Error(`Kavling sudah terpakai pada tanggal tersebut: ${used.join(", ")}`);
    }

    await tx.bookingKavling.deleteMany({ where: { bookingId: booking.id, unitId: params.unitId } });
    await tx.bookingKavling.createMany({
      data: kavlingIds.map((kavlingId) => ({
        bookingId: booking.id,
        unitId: params.unitId,
        kavlingId,
      })),
    });
  });

  return { ok: true };
}

export async function createAdminBooking(input: {
  customer: { name: string; phone: string; email: string | null | undefined };
  specialRequest?: string | null;
  checkIn: Date;
  checkOut: Date;
  totalGuest: number;
  kavlings?: number[];
  adminUserId?: string;
  paymentSeed?: { kind: "unpaid" | "dp_paid" | "paid"; paidAmount: number };
  dp?: { mode: "percent" | "nominal"; value: number };
  hold?: { id: string; token: string };
  items: Array<{ unitId: string; quantity: number }>;
  addOns?: Array<{ addOnId: string; quantity: number }>;
}) {
  const items = input.items.filter((x) => x.quantity > 0);
  if (!items.length) throw new Error("Pilih minimal 1 unit");

  await assertAvailabilityForItems({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    items,
  });

  const unitIds = [...new Set(items.map((x) => x.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } } });
  const unitById = new Map(units.map((u) => [u.id, u]));
  if (units.length !== unitIds.length) throw new Error("Ada unit yang tidak ditemukan");

  const capacityTotal = items.reduce((acc, it) => acc + (unitById.get(it.unitId)?.capacity ?? 0) * it.quantity, 0);
  if (capacityTotal > 0 && input.totalGuest > capacityTotal) {
    throw new Error(`Total guest melebihi kapasitas. Maks: ${capacityTotal}`);
  }

  const cfg = await getKavlingConfig(prisma);
  const privateStart = Math.max(1, Math.min(cfg.privateStart, cfg.sellCount));
  const privateEnd = Math.max(privateStart, Math.min(cfg.privateEnd, cfg.sellCount));
  function deriveCategoryFromUnit(u: { category: string | null; name: string; kavlingScope?: string | null }) {
    const scope = (u.kavlingScope ?? "").toLowerCase();
    if (scope === "private") return "private";
    if (scope === "mandiri") return "mandiri";
    if (scope === "paket") return "paket";
    const raw = (u.category ?? "").toLowerCase();
    if (raw.includes("private")) return "private";
    if (raw.includes("mandiri") || raw.includes("kavling")) return "mandiri";
    if (raw.includes("paket")) return "paket";
    const n = u.name.toLowerCase();
    if (n.includes("private")) return "private";
    if (n.includes("mandiri") || n.includes("kavling")) return "mandiri";
    if (n.startsWith("paket ")) return "paket";
    return "unit";
  }

  const mandiriItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "mandiri");
  const privateItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "private");
  const paketItems = items.filter((it) => deriveCategoryFromUnit(unitById.get(it.unitId)!) === "paket");
  const mandiriRequired = mandiriItems.reduce((acc, it) => acc + it.quantity, 0);
  const privateRequired = privateItems.reduce((acc, it) => acc + it.quantity, 0);
  const paketRequired = paketItems.reduce((acc, it) => acc + it.quantity, 0);

  const addOns = (() => {
    const base = (input.addOns ?? []).filter((x) => x.quantity > 0);
    const map = new Map<string, number>();
    for (const it of base) map.set(it.addOnId, (map.get(it.addOnId) ?? 0) + it.quantity);
    for (const it of items) {
      const u = unitById.get(it.unitId) as unknown as { autoAddOnId?: string | null; autoAddOnMode?: string | null };
      const addOnId = u.autoAddOnId ?? "";
      const mode = (u.autoAddOnMode ?? "") as "per_pax" | "per_unit" | "per_booking" | "";
      if (!addOnId || !mode) continue;
      if (mode === "per_pax") map.set(addOnId, Math.max(map.get(addOnId) ?? 0, input.totalGuest));
      else if (mode === "per_unit") map.set(addOnId, (map.get(addOnId) ?? 0) + it.quantity);
      else if (mode === "per_booking") map.set(addOnId, (map.get(addOnId) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([addOnId, quantity]) => ({ addOnId, quantity }));
  })();

  const addOnIds = [...new Set(addOns.map((x) => x.addOnId))];
  const addOnRows = addOnIds.length ? await prisma.addOn.findMany({ where: { id: { in: addOnIds } } }) : [];
  if (addOnRows.length !== addOnIds.length) throw new Error("Ada add-on yang tidak ditemukan");
  const addOnById = new Map(addOnRows.map((a) => [a.id, a]));

  const baseAmount = await calcBaseAmountDaily({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    items: items.map((it) => ({ unitId: it.unitId, quantity: it.quantity })),
  });

  const addOnAmount = addOns.reduce((acc, it) => acc + (addOnById.get(it.addOnId)?.price ?? 0) * it.quantity, 0);
  const amount = baseAmount + addOnAmount;

  const dpPlannedAmount = (() => {
    const raw = input.dp?.value ?? 0;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (input.dp?.mode === "percent") return Math.round((amount * value) / 100);
    return Math.round(value);
  })();
  const safeDpPlannedAmount = Math.max(0, Math.min(amount, dpPlannedAmount));

  const seedKind = input.paymentSeed?.kind ?? "unpaid";
  const seedPaid = Math.max(0, Math.round(Number(input.paymentSeed?.paidAmount ?? 0) || 0));

  const initialPaidAmount =
    seedKind === "paid"
      ? amount
      : seedKind === "dp_paid"
        ? Math.max(0, Math.min(amount - 1, seedPaid))
        : 0;
  const bookingStatus: BookingStatus = seedKind === "paid" ? "paid" : "pending";
  const paymentStatus = seedKind === "paid" ? "paid" : seedKind === "dp_paid" && initialPaidAmount > 0 ? "partial" : "pending";
  const method = seedKind === "paid" || paymentStatus === "partial" ? "rekening_perusahaan" : null;
  const paidAt = seedKind === "paid" || paymentStatus === "partial" ? new Date() : null;
  const plannedDpAmount = seedKind === "unpaid" ? safeDpPlannedAmount : 0;
  const requestedKavlings = (input.kavlings ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));

  const totalKavlingRequired = mandiriRequired + paketRequired + privateRequired;
  const nonPrivateKavlingRequired = mandiriRequired + paketRequired;
  if (!totalKavlingRequired && requestedKavlings.length) {
    throw new Error("Kavling hanya untuk paket atau camping mandiri");
  }
  const required = totalKavlingRequired;
  if (required) {
    const unique = Array.from(new Set(requestedKavlings));
    unique.sort((a, b) => a - b);
    if (unique.length !== requestedKavlings.length) throw new Error("Nomor kavling duplikat");
    if (unique.length !== required) throw new Error(`Jumlah kavling harus ${required}`);
    if (unique.some((n) => n < 1 || n > cfg.sellCount)) throw new Error(`Nomor kavling harus 1 - ${cfg.sellCount}`);
    const privateNums = unique.filter((n) => n >= privateStart && n <= privateEnd);
    const nonPrivateNums = unique.filter((n) => n < privateStart || n > privateEnd);
    if (privateNums.length !== privateRequired) throw new Error(`Jumlah kavling Paket Private harus ${privateRequired}`);
    if (nonPrivateNums.length !== nonPrivateKavlingRequired) throw new Error(`Jumlah kavling Paket/Camping Mandiri harus ${nonPrivateKavlingRequired}`);
  }

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email ? String(input.customer.email) : null,
      },
    });

    const booking = await tx.booking.create({
      data: {
        code: bookingCode(),
        customerId: customer.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        totalGuest: input.totalGuest,
        status: bookingStatus,
        specialRequest: input.specialRequest ?? null,
        items: { create: items.map((it) => ({ unitId: it.unitId, quantity: it.quantity })) },
        addOns: { create: addOns.map((it) => ({ addOnId: it.addOnId, quantity: it.quantity })) },
        payment: {
          create: {
            amount,
            paidAmount: initialPaidAmount,
            dpPlannedAmount: plannedDpAmount,
            status: paymentStatus,
            method,
            paidAt,
          },
        },
      },
      include: { payment: true },
    });

    if (booking.payment && (seedKind === "dp_paid" || seedKind === "paid") && initialPaidAmount > 0) {
      await tx.paymentTransaction.create({
        data: {
          paymentId: booking.payment.id,
          adminUserId: input.adminUserId ?? null,
          action: seedKind === "paid" ? "seed_paid_to_company_account" : "seed_dp_paid_to_company_account",
          amountDelta: initialPaidAmount,
          paidAmountBefore: 0,
          paidAmountAfter: initialPaidAmount,
          method: "rekening_perusahaan",
        },
      });
    }

    if (required) {
      const unique = Array.from(new Set(requestedKavlings));
      unique.sort((a, b) => a - b);
      if (unique.length !== required) throw new Error(`Jumlah kavling harus ${required}`);
      const privateNums = unique.filter((n) => n >= privateStart && n <= privateEnd);
      const nonPrivateNums = unique.filter((n) => n < privateStart || n > privateEnd);
      const requiredNonPrivate = mandiriRequired + paketRequired;
      if (privateNums.length !== privateRequired) throw new Error(`Jumlah kavling Paket Private harus ${privateRequired}`);
      if (nonPrivateNums.length !== requiredNonPrivate) throw new Error(`Jumlah kavling Paket/Camping Mandiri harus ${requiredNonPrivate}`);

      const mandiriUnitIds = mandiriRequired ? Array.from(new Set(mandiriItems.map((x) => x.unitId))) : [];
      const paketUnitIds = paketRequired ? Array.from(new Set(paketItems.map((x) => x.unitId))) : [];
      const privateUnitIds = privateRequired ? Array.from(new Set(privateItems.map((x) => x.unitId))) : [];
      if (mandiriUnitIds.length > 1) throw new Error("Pilih 1 item Camping Mandiri saja untuk pemilihan kavling");
      if (paketUnitIds.length > 1) throw new Error("Pilih 1 item Paket saja untuk pemilihan kavling");
      if (privateUnitIds.length > 1) throw new Error("Pilih 1 item Paket Private saja untuk pemilihan kavling");

      if (input.hold?.id && input.hold?.token) {
        const now = new Date();
        const hold = await tx.kavlingHold.findFirst({
          where: { id: input.hold.id, token: input.hold.token, expiresAt: { gt: now } },
          include: { kavlings: { include: { kavling: true } } },
        });
        if (!hold) throw new Error("Hold kavling tidak valid atau sudah expired");
        const holdIn = hold.checkIn.toISOString().slice(0, 10);
        const holdOut = hold.checkOut.toISOString().slice(0, 10);
        const inStr = input.checkIn.toISOString().slice(0, 10);
        const outStr = input.checkOut.toISOString().slice(0, 10);
        if (holdIn !== inStr || holdOut !== outStr) throw new Error("Hold kavling tidak sesuai tanggal");
        const expectedScope =
          privateRequired && (mandiriRequired || paketRequired)
            ? "mixed"
            : privateRequired
              ? "private"
              : mandiriRequired && paketRequired
                ? "paket"
                : mandiriRequired
                  ? "mandiri"
                  : "paket";
        if (hold.scope !== expectedScope) throw new Error("Hold kavling tidak sesuai kategori");
        const holdNums = hold.kavlings.map((x) => x.kavling.number).sort((a, b) => a - b);
        if (holdNums.length !== unique.length || holdNums.some((n, i) => n !== unique[i])) {
          throw new Error("Hold kavling tidak sesuai pilihan");
        }
      }

      await tx.kavling.createMany({
        data: unique.map((number) => ({ number })),
        skipDuplicates: true,
      });

      const kavlings = await tx.kavling.findMany({ where: { number: { in: unique } } });
      if (kavlings.length !== unique.length) throw new Error("Ada nomor kavling yang tidak valid");
      const kavlingByNumber = new Map(kavlings.map((k) => [k.number, k]));
      const kavlingIds = unique.map((n) => kavlingByNumber.get(n)!.id);

      await lockKavlings(tx, kavlingIds);

      const conflicts = await tx.bookingKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          bookingId: { not: booking.id },
          booking: {
            status: { not: "cancelled" },
            checkIn: { lt: booking.checkOut },
            checkOut: { gt: booking.checkIn },
          },
        },
        include: { kavling: true },
      });
      if (conflicts.length) {
        const used = Array.from(new Set(conflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sudah terpakai pada tanggal tersebut: ${used.join(", ")}`);
      }

      const now = new Date();
      const holdConflicts = await tx.kavlingHoldKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          hold: {
            expiresAt: { gt: now },
            checkIn: { lt: booking.checkOut },
            checkOut: { gt: booking.checkIn },
            ...(input.hold?.id ? { id: { not: input.hold.id } } : {}),
          },
        },
        include: { kavling: true },
      });
      if (holdConflicts.length) {
        const used = Array.from(new Set(holdConflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sedang di-hold: ${used.join(", ")}`);
      }

      const assigned = (() => {
        const rows: Array<{ unitId: string; numbers: number[] }> = [];
        if (privateRequired) rows.push({ unitId: privateUnitIds[0]!, numbers: privateNums });
        if (paketRequired) rows.push({ unitId: paketUnitIds[0]!, numbers: nonPrivateNums.slice(0, paketRequired) });
        if (mandiriRequired) rows.push({ unitId: mandiriUnitIds[0]!, numbers: nonPrivateNums.slice(paketRequired) });
        return rows;
      })();

      const createRows = assigned.flatMap((a) =>
        a.numbers.map((n) => ({
          bookingId: booking.id,
          unitId: a.unitId,
          kavlingId: kavlingByNumber.get(n)!.id,
        })),
      );

      await tx.bookingKavling.createMany({ data: createRows });

      if (input.hold?.id && input.hold?.token) {
        await tx.kavlingHold.deleteMany({ where: { id: input.hold.id, token: input.hold.token } });
      }
    }

    return { bookingId: booking.id, code: booking.code, amount };
  });
}

