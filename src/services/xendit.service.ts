import { prisma } from "@/lib/prisma";
import { maybeSendDpReceivedEmails, maybeSendPaidEmails } from "@/services/email.service";
import { formatIDR } from "@/lib/format";

type XenditInvoice = {
  id: string;
  external_id: string;
  status: string;
  amount: number;
  invoice_url: string;
  expiry_date?: string;
};

type XenditInvoiceCallback = {
  id: string;
  external_id: string;
  status: string;
  paid_amount?: number | null;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_channel?: string | null;
  payment_destination?: string | null;
};

async function getXenditSecretKeyOrThrow() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { xenditSecretKey: true } });
  const secret = (cfg?.xenditSecretKey ?? "").trim();
  if (!secret) throw new Error("Xendit Secret Key belum diset");
  return secret;
}

async function fetchXenditInvoiceById(invoiceId: string) {
  const secret = await getXenditSecretKeyOrThrow();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://api.xendit.co/v2/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "GET",
      headers: {
        authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      },
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data || typeof data.id !== "string") {
      const msg = data?.message ?? "Gagal fetch invoice Xendit";
      throw new Error(msg);
    }
    return data as XenditInvoice & {
      paid_amount?: number | null;
      paid_at?: string | null;
      payment_method?: string | null;
      payment_channel?: string | null;
    };
  } finally {
    clearTimeout(t);
  }
}

export async function reconcileXenditPaymentById(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment tidak ditemukan");
  if (payment.gateway !== "xendit_invoice" || !payment.gatewayRef) throw new Error("Payment ini tidak memakai Xendit invoice");

  const inv = await fetchXenditInvoiceById(payment.gatewayRef);
  const cb: XenditInvoiceCallback = {
    id: inv.id,
    external_id: inv.external_id,
    status: inv.status,
    paid_amount: (inv as any).paid_amount ?? null,
    paid_at: (inv as any).paid_at ?? null,
    payment_method: (inv as any).payment_method ?? null,
    payment_channel: (inv as any).payment_channel ?? null,
  };
  await handleXenditInvoiceCallback(cb);
  return { ok: true, status: inv.status };
}

function normalizeXenditMethodCode(method: string | null | undefined) {
  const s = String(method ?? "").trim();
  if (!s) return "XENDIT";
  const n = s.toUpperCase().replace(/\s+/g, "_");
  if (n.includes("ALFAMART") || n.includes("ALFA")) return "ALFAMART";
  if (n.includes("INDOMARET")) return "INDOMARET";
  if (n.includes("ASTRAPAY")) return "ASTRAPAY";
  if (n.includes("JENIUSPAY") || n.includes("JENIUS")) return "JENIUSPAY";
  if (n.includes("SHOPEEPAY")) return "SHOPEEPAY";
  if (n.includes("LINKAJA")) return "LINKAJA";
  if (n === "DANA" || n.includes("DANA")) return "DANA";
  if (n.includes("OVO")) return "OVO";
  if (n.includes("GOPAY")) return "GOPAY";
  if (n.includes("KREDIVO")) return "KREDIVO";
  if (n.includes("AKULAKU")) return "AKULAKU";
  if (n.includes("INDODANA")) return "INDODANA";
  if (n.includes("ATOME")) return "ATOME";
  if (n.includes("UANGME")) return "UANGME";
  if (n.includes("QRIS")) return "QRIS";
  if (n.includes("QR_CODE")) return "QR_CODE";
  if (n.includes("DIRECT_DEBIT")) return "DIRECT_DEBIT";
  if (n.includes("PAYLATER")) return "PAYLATER";
  if (n.includes("RETAIL_OUTLET")) return "RETAIL_OUTLET";
  if (n.includes("OVO") || n.includes("DANA") || n.includes("LINKAJA") || n.includes("SHOPEEPAY") || n.includes("GOPAY") || n.includes("EWALLET"))
    return "EWALLET";
  if (
    n.includes("CREDIT_CARD") ||
    n.includes("CARD") ||
    n.includes("VISA") ||
    n.includes("MASTERCARD") ||
    n.includes("JCB") ||
    n.includes("AMEX")
  )
    return "CREDIT_CARD";
  if (
    n.includes("BANK_TRANSFER") ||
    n.includes("BCA") ||
    n.includes("BNI") ||
    n.includes("BRI") ||
    n.includes("MANDIRI") ||
    n.includes("PERMATA") ||
    n.includes("BSI")
  )
    return "BANK_TRANSFER";
  return n;
}

function parseXenditPaymentMethodsJson(raw: string | null | undefined) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => ({
        code: typeof x?.code === "string" ? x.code.trim().toUpperCase() : "",
        enabled: !!x?.enabled,
        feeFlat: Math.max(0, Math.round(Number(x?.feeFlat ?? x?.serviceFee ?? 0) || 0)),
        feeBps: Math.max(0, Math.min(10_000, Math.round(Number(x?.feeBps ?? 0) || 0))),
      }))
      .filter((x) => x.code);
  } catch {
    return [];
  }
}

function toBroadXenditMethod(code: string) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return "XENDIT";
  if (c === "ALFAMART" || c === "INDOMARET") return "RETAIL_OUTLET";
  if (c === "OVO" || c === "DANA" || c === "LINKAJA" || c === "SHOPEEPAY" || c === "GOPAY" || c === "ASTRAPAY" || c === "JENIUSPAY")
    return "EWALLET";
  if (c === "KREDIVO" || c === "AKULAKU" || c === "INDODANA" || c === "ATOME" || c === "UANGME") return "PAYLATER";
  return c;
}

function splitGrossToBaseAndFee(params: { gross: number; feeBps: number; feeFlat: number }) {
  const gross = Math.max(0, Math.round(Number(params.gross) || 0));
  const feeFlat = Math.max(0, Math.round(Number(params.feeFlat) || 0));
  const feeBps = Math.max(0, Math.min(10_000, Math.round(Number(params.feeBps) || 0)));
  if (gross <= 0) return { base: 0, fee: 0 };
  const grossMinusFlat = Math.max(0, gross - feeFlat);
  const divisor = 1 + feeBps / 10_000;
  const baseApprox = feeBps > 0 ? Math.round(grossMinusFlat / divisor) : grossMinusFlat;
  const pctFee = Math.max(0, Math.round((baseApprox * feeBps) / 10_000));
  const fee = Math.max(0, Math.min(gross, feeFlat + pctFee));
  const base = Math.max(0, gross - fee);
  return { base, fee };
}

function parsePaymentIdFromExternalId(externalId: string) {
  const s = String(externalId ?? "");
  if (!s.startsWith("wf_payment_")) return null;
  const parts = s.split("_");
  if (parts.length < 4) return null;
  const kind = parts.length >= 5 ? parts[parts.length - 2] : null;
  if (kind === "dp" || kind === "balance") return parts.slice(2, parts.length - 2).join("_") || null;
  return parts.slice(2, parts.length - 1).join("_") || null;
}

function parseInvoiceKindFromExternalId(externalId: string) {
  const s = String(externalId ?? "");
  if (!s.startsWith("wf_payment_")) return null;
  const parts = s.split("_");
  if (parts.length < 5) return null;
  const kind = parts[parts.length - 2];
  if (kind === "dp" || kind === "balance") return kind as "dp" | "balance";
  return null;
}

function normalizePhoneId(phone: string) {
  const p = String(phone ?? "").trim();
  if (!p) return undefined;
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+62${p.slice(1)}`;
  if (p.startsWith("62")) return `+${p}`;
  return p;
}

async function getXenditConfig() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const secretKey = cfg?.xenditSecretKey ?? process.env.XENDIT_SECRET_KEY ?? "";
  const callbackToken = cfg?.xenditCallbackToken ?? process.env.XENDIT_CALLBACK_TOKEN ?? "";
  return { secretKey, callbackToken };
}

async function getXenditSecretKey() {
  const { secretKey } = await getXenditConfig();
  if (!secretKey) throw new Error("Xendit belum dikonfigurasi");
  return secretKey;
}

export async function assertXenditCallbackToken(req: Request) {
  const { callbackToken } = await getXenditConfig();
  if (!callbackToken) throw new Error("Xendit callback token belum dikonfigurasi");
  const got = req.headers.get("x-callback-token") ?? req.headers.get("X-Callback-Token") ?? "";
  if (got !== callbackToken) throw new Error("Invalid callback token");
}

function xenditInvoicePaymentMethodsForConfigCode(code: string) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return [];
  if (c === "BANK_TRANSFER") return ["BCA", "BNI", "BRI", "MANDIRI", "PERMATA"];
  if (c === "RETAIL_OUTLET") return ["ALFAMART", "INDOMARET"];
  if (c === "EWALLET") return ["OVO", "DANA", "SHOPEEPAY", "LINKAJA", "ASTRAPAY", "JENIUSPAY"];
  if (c === "QRIS") return ["QRIS"];
  if (c === "QR_CODE") return ["QRIS"];
  if (c === "CREDIT_CARD") return ["CREDIT_CARD"];
  if (c === "DIRECT_DEBIT") return ["DD_BRI", "DD_MANDIRI"];
  if (c === "PAYLATER") return ["KREDIVO", "AKULAKU", "INDODANA", "ATOME", "UANGME"];
  return [c];
}

export async function createXenditInvoiceByBookingCode(params: {
  bookingCode: string;
  origin: string;
  mode?: "dp" | "balance";
  paymentMethodCode?: string;
}) {
  const booking = await prisma.booking.findUnique({
    where: { code: params.bookingCode },
    include: { customer: true, payment: true },
  });
  if (!booking) throw new Error("Booking tidak ditemukan");
  if (!booking.payment) throw new Error("Payment tidak ditemukan");
  if (booking.status === "cancelled") throw new Error("Booking cancelled");
  if (booking.payment.status === "paid") return { invoiceUrl: booking.payment.checkoutUrl ?? null };

  const mode = params.mode ?? "balance";
  const outstanding = Math.max(0, (booking.payment.amount ?? 0) - (booking.payment.paidAmount ?? 0));
  if (!outstanding) return { invoiceUrl: booking.payment.checkoutUrl ?? null };

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const dpPercent = Math.max(0, Math.min(100, cfg?.dpPercent ?? 50)) / 100;
  const dpMinAmount = Math.max(0, cfg?.dpMinAmount ?? 500000);
  const allowedConfigMethodCodes = new Set([
    "CREDIT_CARD",
    "BANK_TRANSFER",
    "EWALLET",
    "QR_CODE",
    "QRIS",
    "RETAIL_OUTLET",
    "DIRECT_DEBIT",
    "PAYLATER",
  ]);
  const configuredMethods = parseXenditPaymentMethodsJson(cfg?.xenditPaymentMethodsJson);
  const enabledConfigMethodCodes = configuredMethods.filter((m) => m.enabled && allowedConfigMethodCodes.has(m.code)).map((m) => m.code);
  const enabledPaymentMethods = Array.from(
    new Set(
      enabledConfigMethodCodes.flatMap((c) => xenditInvoicePaymentMethodsForConfigCode(c)).filter((x) => !!x),
    ),
  );

  const invoiceKind = mode === "dp" ? "dp" : "balance";
  const plannedDp = Math.max(0, booking.payment.dpPlannedAmount ?? 0);
  const defaultDp = Math.max(dpMinAmount, Math.round((booking.payment.amount ?? outstanding) * dpPercent));
  const targetDp = plannedDp > 0 ? plannedDp : defaultDp;
  const invoiceAmount = invoiceKind === "dp" ? Math.min(outstanding, targetDp) : outstanding;

  const selectedMethod = params.paymentMethodCode ? String(params.paymentMethodCode).trim().toUpperCase() : null;
  const selectedAllowed = selectedMethod && allowedConfigMethodCodes.has(selectedMethod);
  const selectedEnabled = selectedAllowed ? enabledConfigMethodCodes.includes(selectedMethod) : false;
  const paymentMethodsForInvoice = selectedEnabled ? xenditInvoicePaymentMethodsForConfigCode(selectedMethod!) : enabledPaymentMethods;
  const feeCfg = selectedEnabled ? configuredMethods.find((m) => m.code === selectedMethod) ?? null : null;
  const serviceFeeForInvoice =
    feeCfg && invoiceAmount > 0
      ? Math.max(0, Math.round((invoiceAmount * (feeCfg.feeBps ?? 0)) / 10_000)) + Math.max(0, feeCfg.feeFlat ?? 0)
      : 0;
  const invoiceGrossAmount = invoiceAmount + serviceFeeForInvoice;
  const remainingAfter = Math.max(0, (booking.payment.amount ?? 0) - ((booking.payment.paidAmount ?? 0) + invoiceAmount));
  const invoiceFeeBps = feeCfg?.feeBps ?? 0;
  const invoiceFeeFlat = feeCfg?.feeFlat ?? 0;

  const now = new Date();
  if (booking.payment.gateway === "xendit_invoice" && booking.payment.checkoutUrl && (!booking.payment.gatewayExpiresAt || booking.payment.gatewayExpiresAt > now)) {
    const existingKind = booking.payment.gatewayExternalId ? parseInvoiceKindFromExternalId(booking.payment.gatewayExternalId) : null;
    if (!existingKind || existingKind === invoiceKind) return { invoiceUrl: booking.payment.checkoutUrl };
  }

  const lastInvoice = await prisma.paymentTransaction.findFirst({
    where: { paymentId: booking.payment.id, action: { startsWith: "gateway_invoice_created" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastInvoice) {
    const recentMs = now.getTime() - lastInvoice.createdAt.getTime();
    if (recentMs >= 0 && recentMs < 60_000) {
      if (booking.payment.checkoutUrl) return { invoiceUrl: booking.payment.checkoutUrl };
      throw new Error("Mohon tunggu sebentar sebelum membuat link pembayaran baru");
    }
  }

  const secret = await getXenditSecretKey();
  const externalId = `wf_payment_${booking.payment.id}_${invoiceKind}_${Date.now()}`;
  const body = {
    external_id: externalId,
    amount: invoiceGrossAmount,
    description:
      invoiceKind === "dp"
        ? `Booking ${booking.code} (DP) - Sisa ${formatIDR(remainingAfter)}`
        : `Booking ${booking.code} (Pelunasan) - Sisa ${formatIDR(remainingAfter)}`,
    invoice_duration: 60 * 60,
    ...(paymentMethodsForInvoice.length ? { payment_methods: paymentMethodsForInvoice } : {}),
    customer: {
      given_names: booking.customer.name,
      email: booking.customer.email ?? undefined,
      mobile_number: normalizePhoneId(booking.customer.phone),
    },
    success_redirect_url: `${params.origin}/booking?code=${encodeURIComponent(booking.code)}&paid=1`,
    failure_redirect_url: `${params.origin}/booking?code=${encodeURIComponent(booking.code)}&paid=0`,
    currency: "IDR",
    metadata: {
      bookingCode: booking.code,
      invoiceKind,
      baseAmount: invoiceAmount,
      serviceFeeAmount: serviceFeeForInvoice,
      remainingAfter,
      selectedConfigPaymentMethod: selectedEnabled ? selectedMethod : null,
    },
  };

  const doCreate = async (overrideBody?: Record<string, unknown>) => {
    const res = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(overrideBody ?? body),
    });
    const data = (await res.json().catch(() => null)) as XenditInvoice | { message?: string } | null;
    return { res, data };
  };

  let { res, data } = await doCreate();
  if ((!res.ok || !data || typeof (data as any).invoice_url !== "string") && typeof (data as any)?.message === "string") {
    const msg = String((data as any).message);
    const mismatch = msg.toLowerCase().includes("payment method choices did not match");
    if (mismatch) {
      if (params.paymentMethodCode) {
        throw new Error("Metode pembayaran ini belum tersedia di akun Xendit Anda. Aktifkan channel tersebut di dashboard Xendit atau pilih metode lain.");
      }
      const { payment_methods: _pm, ...rest } = body as any;
      ({ res, data } = await doCreate(rest));
    }
  }
  if (!res.ok || !data || typeof (data as any).invoice_url !== "string") {
    const msg = (data as any)?.message ?? "Gagal membuat invoice Xendit";
    throw new Error(msg);
  }

  const expiry = typeof (data as any).expiry_date === "string" ? new Date((data as any).expiry_date) : null;

  await prisma.payment.update({
    where: { id: booking.payment.id },
    data: {
      gateway: "xendit_invoice",
      gatewayRef: (data as any).id,
      gatewayExternalId: (data as any).external_id,
      checkoutUrl: (data as any).invoice_url,
      gatewayStatus: (data as any).status,
      gatewayExpiresAt: expiry,
      invoiceKind,
      invoiceBaseAmount: invoiceAmount,
      invoiceFeeAmount: serviceFeeForInvoice,
      invoiceFeeBps,
      invoiceFeeFlat,
      method: booking.payment.method ?? "xendit",
    },
  });

  await prisma.paymentTransaction.create({
    data: {
      paymentId: booking.payment.id,
      action: `gateway_invoice_created:${invoiceKind}`,
      amountDelta: 0,
      paidAmountBefore: booking.payment.paidAmount ?? 0,
      paidAmountAfter: booking.payment.paidAmount ?? 0,
      method: "xendit",
    },
  });

  return { invoiceUrl: (data as any).invoice_url as string };
}

export async function handleXenditInvoiceCallback(payload: XenditInvoiceCallback) {
  const externalId = payload.external_id;
  if (!externalId) throw new Error("external_id tidak ada");

  let payment = await prisma.payment.findFirst({
    where: { gatewayExternalId: externalId },
    include: { booking: true },
  });
  if (!payment) {
    const paymentId = parsePaymentIdFromExternalId(externalId);
    if (!paymentId) throw new Error("Payment tidak ditemukan");
    payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
  }
  if (!payment) throw new Error("Payment tidak ditemukan");

  const payloadPaid = Math.round(Number(payload.paid_amount ?? 0) || 0);
  const st = (payload.status ?? "").toUpperCase();
  const channelCode = normalizeXenditMethodCode(payload.payment_channel);
  const methodCode = normalizeXenditMethodCode(payload.payment_method);
  const method = channelCode !== "XENDIT" ? channelCode : methodCode !== "XENDIT" ? methodCode : "XENDIT";
  const feeCfg = (() => {
    const bps = Math.max(0, Math.min(10_000, Math.round(Number((payment as any).invoiceFeeBps ?? 0) || 0)));
    const flat = Math.max(0, Math.round(Number((payment as any).invoiceFeeFlat ?? 0) || 0));
    if (bps > 0 || flat > 0) return { feeBps: bps, feeFlat: flat };
    return null;
  })();

  const idempotencyKey = `gateway_webhook:${externalId}`;

  const flags = await prisma.$transaction(async (tx) => {
    const existing = await tx.paymentTransaction.findFirst({
      where: { paymentId: payment.id, action: idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          gateway: "xendit_invoice",
          gatewayRef: payload.id ?? payment.gatewayRef,
          gatewayExternalId: externalId,
          gatewayStatus: payload.status ?? payment.gatewayStatus,
        },
      });
      return { sendPaid: false, sendDp: false };
    }

    const before = payment.paidAmount ?? 0;
    const split = splitGrossToBaseAndFee({ gross: payloadPaid, feeBps: feeCfg?.feeBps ?? 0, feeFlat: feeCfg?.feeFlat ?? 0 });
    const baseDelta = split.base;
    const feeDelta = split.fee;
    const nextPaidAmount = baseDelta > 0 ? Math.max(before, Math.min(payment.amount, before + baseDelta)) : before;
    const paidDelta = nextPaidAmount - before;
    const nextStatus = (() => {
      if (st === "EXPIRED") return nextPaidAmount > 0 ? "partial" : "expired";
      if (nextPaidAmount >= payment.amount) return "paid";
      if (nextPaidAmount > 0) return "partial";
      return "pending";
    })();
    const nextPaidAt = nextStatus === "paid" ? (payload.paid_at ? new Date(payload.paid_at) : new Date()) : null;
    const dpJustReceived = before <= 0 && nextPaidAmount > 0 && nextStatus === "partial";

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        paidAmount: nextPaidAmount,
        paidAt: nextPaidAt,
        method,
        gateway: "xendit_invoice",
        gatewayRef: payload.id ?? payment.gatewayRef,
        gatewayExternalId: externalId,
        gatewayStatus: payload.status ?? payment.gatewayStatus,
        ...(feeDelta > 0 ? { serviceFeeAmount: { increment: feeDelta } } : {}),
      },
    });

    if (payment.booking.status !== "completed" && payment.booking.status !== "checked_in") {
      const wasAutoCancelled = payment.booking.status === "cancelled" && (payment.status === "expired" || payment.gatewayStatus === "EXPIRED") && before <= 0;
      if (payment.booking.status !== "cancelled" || wasAutoCancelled) {
        const nextBookingStatus =
          nextStatus === "paid"
            ? "paid"
            : nextStatus === "expired" && nextPaidAmount <= 0
              ? "cancelled"
              : "pending";
        await tx.booking.update({ where: { id: payment.bookingId }, data: { status: nextBookingStatus } });
      }
    }

    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        action: idempotencyKey,
        amountDelta: paidDelta,
        paidAmountBefore: before,
        paidAmountAfter: nextPaidAmount,
        method,
      },
    });

    return { sendPaid: payment.status !== "paid" && nextStatus === "paid", sendDp: dpJustReceived };
  });

  if (flags.sendDp) await maybeSendDpReceivedEmails(payment.id).catch(() => null);
  if (flags.sendPaid) await maybeSendPaidEmails(payment.id).catch(() => null);

  return { ok: true };
}
