import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const UpdateSchema = z
  .object({
    kavlingSellCount: z.coerce.number().int().min(1).max(110),
    privateKavlingStart: z.coerce.number().int().min(1).max(110),
    privateKavlingEnd: z.coerce.number().int().min(1).max(110),
    holdMinutes: z.coerce.number().int().min(1).max(30).optional(),
    xenditSecretKey: z.string().min(1).optional(),
    xenditCallbackToken: z.string().min(1).optional(),
    xenditPaymentMethods: z
      .array(
        z.object({
          code: z.string().min(1).max(64),
          enabled: z.coerce.boolean(),
          feeFlat: z.coerce.number().int().min(0).max(50_000_000).optional(),
          feeBps: z.coerce.number().int().min(0).max(10_000).optional(),
          serviceFee: z.coerce.number().int().min(0).max(50_000_000).optional(),
        }),
      )
      .optional(),
    smtpHost: z.string().min(1).optional(),
    smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
    smtpSecure: z.coerce.boolean().optional(),
    smtpUser: z.string().min(1).optional(),
    smtpPassword: z.string().min(1).optional(),
    smtpFromName: z.string().min(1).optional(),
    paymentNotifyEmails: z.string().min(1).optional(),
    balanceReminderDays: z.coerce.number().int().min(0).optional(),
    dpPercent: z.coerce.number().int().min(1).max(100).optional(),
    dpMinAmount: z.coerce.number().int().min(0).optional(),
    reminderDays: z.string().optional(),
  })
  .refine((v) => v.privateKavlingStart <= v.privateKavlingEnd, {
    message: "Range private tidak valid",
    path: ["privateKavlingEnd"],
  })
  .refine((v) => v.privateKavlingEnd <= v.kavlingSellCount, {
    message: "Range private harus berada di dalam jumlah kavling dijual",
    path: ["privateKavlingEnd"],
  });

export async function GET() {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const defaultPaymentMethods = [
    { code: "BANK_TRANSFER", enabled: true, feeFlat: 4000, feeBps: 0 },
    { code: "CREDIT_CARD", enabled: true, feeFlat: 2000, feeBps: 290 },
    { code: "EWALLET", enabled: true, feeFlat: 0, feeBps: 150 },
    { code: "QRIS", enabled: true, feeFlat: 0, feeBps: 70 },
    { code: "RETAIL_OUTLET", enabled: true, feeFlat: 5000, feeBps: 0 },
    { code: "DIRECT_DEBIT", enabled: false, feeFlat: 0, feeBps: 190 },
    { code: "PAYLATER", enabled: false, feeFlat: 0, feeBps: 230 },
    { code: "QR_CODE", enabled: false, feeFlat: 0, feeBps: 70 },
  ];

  const config = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      kavlingSellCount: 110,
      privateKavlingStart: 58,
      privateKavlingEnd: 65,
      mandiriAutoAddOnId: null,
      holdMinutes: 5,
      balanceReminderDays: 7,
      dpPercent: 50,
      dpMinAmount: 500000,
      reminderDays: "7,3,0,-1",
      xenditPaymentMethodsJson: JSON.stringify(defaultPaymentMethods),
    },
    update: {},
  });

  const xenditPaymentMethods = (() => {
    try {
      const raw = config.xenditPaymentMethodsJson ? JSON.parse(config.xenditPaymentMethodsJson) : null;
      if (!Array.isArray(raw)) return defaultPaymentMethods;
      const items = raw
        .map((x) => {
          const code = typeof x?.code === "string" ? String(x.code).trim().toUpperCase() : "";
          const enabled = !!x?.enabled;
          const legacyFlat = Math.max(0, Math.round(Number(x?.serviceFee ?? 0) || 0));
          const feeFlat = Math.max(0, Math.round(Number(x?.feeFlat ?? legacyFlat) || 0));
          const feeBps = Math.max(0, Math.min(10_000, Math.round(Number(x?.feeBps ?? 0) || 0)));
          return { code, enabled, feeFlat, feeBps };
        })
        .filter((x) => x.code);
      return items.length ? items : defaultPaymentMethods;
    } catch {
      return defaultPaymentMethods;
    }
  })();

  return NextResponse.json({
    config: {
      kavlingSellCount: config.kavlingSellCount,
      privateKavlingStart: config.privateKavlingStart,
      privateKavlingEnd: config.privateKavlingEnd,
      holdMinutes: config.holdMinutes,
      xenditSecretKeySet: !!config.xenditSecretKey,
      xenditCallbackTokenSet: !!config.xenditCallbackToken,
      xenditPaymentMethods,
      smtpHost: config.smtpHost ?? "",
      smtpPort: config.smtpPort ?? null,
      smtpSecure: config.smtpSecure ?? true,
      smtpUser: config.smtpUser ?? "",
      smtpFromName: config.smtpFromName ?? "",
      smtpPasswordSet: !!config.smtpPassword,
      paymentNotifyEmails: config.paymentNotifyEmails ?? "",
      balanceReminderDays: config.balanceReminderDays ?? 7,
      dpPercent: config.dpPercent ?? 50,
      dpMinAmount: config.dpMinAmount ?? 500000,
      reminderDays: config.reminderDays ?? "7,3,0,-1",
    },
  });
}

export async function PUT(req: Request) {
  const session = await getAdminSession();
  if (!session.adminUser) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: "Input tidak valid" }, { status: 400 });

  const nextPaymentMethodsJson = (() => {
    const arr = parsed.data.xenditPaymentMethods;
    if (!arr?.length) return undefined;
    const normalized = arr
      .map((x) => {
        const code = String(x.code ?? "").trim().toUpperCase();
        const enabled = !!x.enabled;
        const legacyFlat = Math.max(0, Math.round(Number((x as any).serviceFee ?? 0) || 0));
        const feeFlat = Math.max(0, Math.round(Number(x.feeFlat ?? legacyFlat) || 0));
        const feeBps = Math.max(0, Math.min(10_000, Math.round(Number(x.feeBps ?? 0) || 0)));
        return code ? { code, enabled, feeFlat, feeBps } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return normalized.length ? JSON.stringify(normalized) : undefined;
  })();

  const config = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      kavlingSellCount: parsed.data.kavlingSellCount,
      privateKavlingStart: parsed.data.privateKavlingStart,
      privateKavlingEnd: parsed.data.privateKavlingEnd,
      holdMinutes: parsed.data.holdMinutes ?? 5,
      xenditSecretKey: parsed.data.xenditSecretKey ?? null,
      xenditCallbackToken: parsed.data.xenditCallbackToken ?? null,
      xenditPaymentMethodsJson: nextPaymentMethodsJson ?? null,
      smtpHost: parsed.data.smtpHost ?? null,
      smtpPort: parsed.data.smtpPort ?? null,
      smtpSecure: typeof parsed.data.smtpSecure === "boolean" ? parsed.data.smtpSecure : true,
      smtpUser: parsed.data.smtpUser ?? null,
      smtpPassword: parsed.data.smtpPassword ?? null,
      smtpFromName: parsed.data.smtpFromName ?? null,
      paymentNotifyEmails: parsed.data.paymentNotifyEmails ?? null,
      balanceReminderDays: parsed.data.balanceReminderDays ?? 7,
      dpPercent: parsed.data.dpPercent ?? 50,
      dpMinAmount: parsed.data.dpMinAmount ?? 500000,
      reminderDays: parsed.data.reminderDays ?? "7,3,0,-1",
    },
    update: {
      kavlingSellCount: parsed.data.kavlingSellCount,
      privateKavlingStart: parsed.data.privateKavlingStart,
      privateKavlingEnd: parsed.data.privateKavlingEnd,
      ...(typeof parsed.data.holdMinutes === "number" ? { holdMinutes: parsed.data.holdMinutes } : {}),
      ...(parsed.data.xenditSecretKey ? { xenditSecretKey: parsed.data.xenditSecretKey } : {}),
      ...(parsed.data.xenditCallbackToken ? { xenditCallbackToken: parsed.data.xenditCallbackToken } : {}),
      ...(typeof nextPaymentMethodsJson === "string" ? { xenditPaymentMethodsJson: nextPaymentMethodsJson } : {}),
      ...(parsed.data.smtpHost ? { smtpHost: parsed.data.smtpHost } : {}),
      ...(typeof parsed.data.smtpPort === "number" ? { smtpPort: parsed.data.smtpPort } : {}),
      ...(typeof parsed.data.smtpSecure === "boolean" ? { smtpSecure: parsed.data.smtpSecure } : {}),
      ...(parsed.data.smtpUser ? { smtpUser: parsed.data.smtpUser } : {}),
      ...(parsed.data.smtpPassword ? { smtpPassword: parsed.data.smtpPassword } : {}),
      ...(parsed.data.smtpFromName ? { smtpFromName: parsed.data.smtpFromName } : {}),
      ...(parsed.data.paymentNotifyEmails ? { paymentNotifyEmails: parsed.data.paymentNotifyEmails } : {}),
      ...(typeof parsed.data.balanceReminderDays === "number"
        ? { balanceReminderDays: parsed.data.balanceReminderDays }
        : {}),
      ...(typeof parsed.data.dpPercent === "number" ? { dpPercent: parsed.data.dpPercent } : {}),
      ...(typeof parsed.data.dpMinAmount === "number" ? { dpMinAmount: parsed.data.dpMinAmount } : {}),
      ...(parsed.data.reminderDays ? { reminderDays: parsed.data.reminderDays } : {}),
    },
  });

  return NextResponse.json({
    config: {
      kavlingSellCount: config.kavlingSellCount,
      privateKavlingStart: config.privateKavlingStart,
      privateKavlingEnd: config.privateKavlingEnd,
      holdMinutes: config.holdMinutes,
      xenditSecretKeySet: !!config.xenditSecretKey,
      xenditCallbackTokenSet: !!config.xenditCallbackToken,
      xenditPaymentMethods:
        typeof nextPaymentMethodsJson === "string"
          ? JSON.parse(nextPaymentMethodsJson)
          : (() => {
              try {
                return config.xenditPaymentMethodsJson ? JSON.parse(config.xenditPaymentMethodsJson) : [];
              } catch {
                return [];
              }
            })(),
      smtpHost: config.smtpHost ?? "",
      smtpPort: config.smtpPort ?? null,
      smtpSecure: config.smtpSecure ?? true,
      smtpUser: config.smtpUser ?? "",
      smtpFromName: config.smtpFromName ?? "",
      smtpPasswordSet: !!config.smtpPassword,
      paymentNotifyEmails: config.paymentNotifyEmails ?? "",
      balanceReminderDays: config.balanceReminderDays ?? 7,
      dpPercent: config.dpPercent ?? 50,
      dpMinAmount: config.dpMinAmount ?? 500000,
      reminderDays: config.reminderDays ?? "7,3,0,-1",
    },
  });
}
