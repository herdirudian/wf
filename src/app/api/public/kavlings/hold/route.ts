import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";
import { parseDateRangeWIB } from "@/lib/time";
import { notifyKavlingUpdated } from "@/lib/realtime";

const BodySchema = z.object({
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  scope: z.enum(["paket", "mandiri", "private", "mixed"]),
  numbers: z.array(z.coerce.number().int()).min(1),
  holdId: z.string().optional(),
  holdToken: z.string().optional(),
});

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function lockKavlings(tx: { $queryRawUnsafe: (...args: any[]) => Promise<unknown> }, kavlingIds: string[]) {
  if (!kavlingIds.length) return;
  const placeholders = kavlingIds.map(() => "?").join(", ");
  await tx.$queryRawUnsafe("SELECT id FROM Kavling WHERE id IN (" + placeholders + ") FOR UPDATE", ...kavlingIds);
}

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });
  const range = (() => {
    try {
      return parseDateRangeWIB(parsed.data.checkIn, parsed.data.checkOut);
    } catch (e) {
      return e instanceof Error ? e : new Error("Input tidak valid");
    }
  })();
  if (range instanceof Error) return NextResponse.json({ message: range.message }, { status: 400 });

  const cfg = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, kavlingSellCount: 110, privateKavlingStart: 58, privateKavlingEnd: 65, mandiriAutoAddOnId: null },
    update: {},
  });
  const holdMinutes = Math.max(1, Math.min(30, cfg.holdMinutes ?? 5));
  const privateStart = Math.max(1, Math.min(cfg.privateKavlingStart, cfg.kavlingSellCount));
  const privateEnd = Math.max(privateStart, Math.min(cfg.privateKavlingEnd, cfg.kavlingSellCount));

  const unique = Array.from(new Set(parsed.data.numbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))));
  unique.sort((a, b) => a - b);
  if (unique.length !== parsed.data.numbers.length) return NextResponse.json({ message: "Nomor kavling duplikat" }, { status: 400 });

  if (parsed.data.scope === "private") {
    if (unique.some((n) => n < privateStart || n > privateEnd)) {
      return NextResponse.json({ message: `Nomor kavling Paket Private harus ${privateStart} - ${privateEnd}` }, { status: 400 });
    }
  } else if (parsed.data.scope === "mixed") {
    if (unique.some((n) => n < 1 || n > cfg.kavlingSellCount)) {
      return NextResponse.json({ message: `Nomor kavling harus 1 - ${cfg.kavlingSellCount}` }, { status: 400 });
    }
  } else {
    if (unique.some((n) => n < 1 || n > cfg.kavlingSellCount)) {
      return NextResponse.json({ message: `Nomor kavling harus 1 - ${cfg.kavlingSellCount}` }, { status: 400 });
    }
    if (unique.some((n) => n >= privateStart && n <= privateEnd)) {
      return NextResponse.json({ message: `Range ${privateStart} - ${privateEnd} khusus untuk Paket Private` }, { status: 400 });
    }
  }

  const desiredExpiresAt = nowPlusMinutes(holdMinutes);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.kavling.createMany({ data: unique.map((number) => ({ number })), skipDuplicates: true });
      const kavlings = await tx.kavling.findMany({ where: { number: { in: unique } } });
      if (kavlings.length !== unique.length) throw new Error("Ada nomor kavling yang tidak valid");
      const kavlingIds = kavlings.map((k) => k.id);

      await lockKavlings(tx, kavlingIds);

      const now = new Date();

      const holdConflicts = await tx.kavlingHoldKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          hold: {
            expiresAt: { gt: now },
            checkIn: { lt: range.checkOut },
            checkOut: { gt: range.checkIn },
            NOT: [
              parsed.data.holdId && parsed.data.holdToken
                ? { id: parsed.data.holdId, token: parsed.data.holdToken }
                : parsed.data.holdId
                  ? { id: parsed.data.holdId }
                  : { id: "none" },
            ],
          },
        },
        include: { kavling: true },
      });
      if (holdConflicts.length) {
        const used = Array.from(new Set(holdConflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sedang di-hold: ${used.join(", ")}`);
      }

      const bookingConflicts = await tx.bookingKavling.findMany({
        where: {
          kavlingId: { in: kavlingIds },
          booking: {
            status: { not: "cancelled" },
            checkIn: { lt: range.checkOut },
            checkOut: { gt: range.checkIn },
          },
        },
        include: { kavling: true },
      });
      if (bookingConflicts.length) {
        const used = Array.from(new Set(bookingConflicts.map((x) => x.kavling.number))).sort((a, b) => a - b);
        throw new Error(`Kavling sudah terpakai pada tanggal tersebut: ${used.join(", ")}`);
      }

      if (parsed.data.holdId && parsed.data.holdToken) {
        const existing = await tx.kavlingHold.findFirst({
          where: { id: parsed.data.holdId, token: parsed.data.holdToken },
          include: { kavlings: true },
        });
        if (existing) {
          const keepAliveThresholdMs = 60_000;
          const existingLeftMs = existing.expiresAt.getTime() - now.getTime();
          const expiresAt = existingLeftMs <= keepAliveThresholdMs ? desiredExpiresAt : existing.expiresAt;
          await tx.kavlingHold.update({
            where: { id: existing.id },
            data: {
              scope: parsed.data.scope,
              checkIn: range.checkIn,
              checkOut: range.checkOut,
              expiresAt,
              kavlings: {
                deleteMany: {},
                create: kavlingIds.map((kavlingId) => ({ kavlingId })),
              },
            },
          });
          return { holdId: existing.id, holdToken: existing.token, expiresAt };
        }
      }

      const token = crypto.randomBytes(24).toString("hex");
      const hold = await tx.kavlingHold.create({
        data: {
          token,
          scope: parsed.data.scope,
          checkIn: range.checkIn,
          checkOut: range.checkOut,
          expiresAt: desiredExpiresAt,
          kavlings: { create: kavlingIds.map((kavlingId) => ({ kavlingId })) },
        },
      });

      return { holdId: hold.id, holdToken: token, expiresAt: desiredExpiresAt };
    });

    await notifyKavlingUpdated();

    return NextResponse.json({ ...result, holdMinutes });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal hold kavling";
    return NextResponse.json({ message }, { status: 400 });
  }
}
