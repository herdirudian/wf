import { PrismaClient } from "@prisma/client";
import { createAdminBooking } from "@/services/booking.service";

const prisma = new PrismaClient();

function rnd() {
  return Math.random().toString(16).slice(2, 10);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run double-booking test in production");
  }

  const token = rnd();
  const createdBookingIds: string[] = [];
  const createdCustomerIds: string[] = [];
  let unitId: string | null = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkIn = new Date(today.getTime() + 40 * 24 * 60 * 60 * 1000);
  const checkOut = new Date(checkIn.getTime() + 24 * 60 * 60 * 1000);

  try {
    const cfg = await prisma.appConfig.upsert({
      where: { id: 1 },
      create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null, holdMinutes: 5 },
      update: {},
      select: { kavlingSellCount: true },
    });
    const sellCount = Math.max(1, Math.min(110, cfg.kavlingSellCount ?? 110));

    const usedRows = await prisma.bookingKavling.findMany({
      where: {
        booking: {
          status: { not: "cancelled" },
          checkIn: { lt: checkOut },
          checkOut: { gt: checkIn },
        },
      },
      include: { kavling: { select: { number: true } } },
    });
    const used = new Set<number>(usedRows.map((x) => x.kavling.number));
    const kavlingNumber = (() => {
      for (let n = 1; n <= sellCount; n += 1) {
        if (!used.has(n)) return n;
      }
      return null;
    })();
    if (!kavlingNumber) throw new Error("No available kavling number found for test");

    const unit = await prisma.unit.create({
      data: {
        name: `TEST-DB-${token}`,
        type: "tenda",
        category: "Camping Mandiri (Kavling)",
        kavlingScope: "mandiri",
        isActive: true,
        capacity: 4,
        totalUnits: 2,
        priceWeekday: 100000,
        priceWeekend: 120000,
        description: null,
        includesJson: null,
        imagesJson: null,
        facilitiesJson: null,
        autoAddOnId: null,
        autoAddOnMode: null,
      },
    });
    unitId = unit.id;

    const b1 = await createAdminBooking({
      customer: { name: `TEST-${token}`, phone: "081234567890", email: null },
      specialRequest: null,
      checkIn,
      checkOut,
      totalGuest: 2,
      kavlings: [kavlingNumber],
      items: [{ unitId: unit.id, quantity: 1 }],
      addOns: [],
    });
    createdBookingIds.push(b1.bookingId);
    const c1 = await prisma.booking.findUnique({ where: { id: b1.bookingId }, select: { customerId: true } });
    if (c1?.customerId) createdCustomerIds.push(c1.customerId);

    let conflictOk = false;
    try {
      await createAdminBooking({
        customer: { name: `TEST2-${token}`, phone: "081234567891", email: null },
        specialRequest: null,
        checkIn,
        checkOut,
        totalGuest: 2,
        kavlings: [kavlingNumber],
        items: [{ unitId: unit.id, quantity: 1 }],
        addOns: [],
      });
    } catch {
      conflictOk = true;
    }

    if (!conflictOk) {
      throw new Error("Expected kavling conflict but booking creation succeeded");
    }

    await prisma.booking.update({ where: { id: b1.bookingId }, data: { status: "cancelled" } });

    const b3 = await createAdminBooking({
      customer: { name: `TEST3-${token}`, phone: "081234567892", email: null },
      specialRequest: null,
      checkIn,
      checkOut,
      totalGuest: 2,
      kavlings: [kavlingNumber],
      items: [{ unitId: unit.id, quantity: 1 }],
      addOns: [],
    });
    createdBookingIds.push(b3.bookingId);
    const c3 = await prisma.booking.findUnique({ where: { id: b3.bookingId }, select: { customerId: true } });
    if (c3?.customerId) createdCustomerIds.push(c3.customerId);
  } finally {
    if (createdBookingIds.length) {
      await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } }).catch(() => null);
    }
    if (createdCustomerIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: Array.from(new Set(createdCustomerIds)) } } }).catch(() => null);
    }
    if (unitId) {
      await prisma.unit.delete({ where: { id: unitId } }).catch(() => null);
    }
  }

  console.log("OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
