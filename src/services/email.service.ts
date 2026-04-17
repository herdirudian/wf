import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { renderInvoiceEmailHtml, type InvoiceEmailModel } from "@/emails/invoice";
import { formatIDR } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  notifyEmails: string[];
};

function parseEmails(input: string) {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePaymentMethods(raw: string | null | undefined) {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => ({
        code: typeof x?.code === "string" ? String(x.code).trim().toUpperCase() : "",
        enabled: !!x?.enabled,
        feeFlat: Math.max(0, Math.round(Number(x?.feeFlat ?? x?.serviceFee ?? 0) || 0)),
        feeBps: Math.max(0, Math.min(10_000, Math.round(Number(x?.feeBps ?? 0) || 0))),
      }))
      .filter((x) => x.code);
  } catch {
    return [];
  }
}

function toBroadMethod(code: string | null | undefined) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return "";
  if (c.includes("QRIS") || c.includes("QR_CODE")) return "QRIS";
  if (c.includes("CREDIT_CARD") || c.includes("CARD") || c.includes("VISA") || c.includes("MASTERCARD") || c.includes("JCB") || c.includes("AMEX"))
    return "CREDIT_CARD";
  if (
    c.includes("BANK_TRANSFER") ||
    c.includes("BCA") ||
    c.includes("BNI") ||
    c.includes("BRI") ||
    c.includes("MANDIRI") ||
    c.includes("PERMATA") ||
    c.includes("BSI")
  )
    return "BANK_TRANSFER";
  if (c.includes("ALFAMART") || c.includes("INDOMARET") || c.includes("RETAIL_OUTLET")) return "RETAIL_OUTLET";
  if (c.includes("DIRECT_DEBIT")) return "DIRECT_DEBIT";
  if (c.includes("PAYLATER") || c.includes("KREDIVO") || c.includes("AKULAKU") || c.includes("INDODANA") || c.includes("ATOME") || c.includes("UANGME"))
    return "PAYLATER";
  if (c.includes("EWALLET") || c.includes("OVO") || c.includes("DANA") || c.includes("LINKAJA") || c.includes("SHOPEEPAY") || c.includes("GOPAY") || c.includes("ASTRAPAY") || c.includes("JENIUSPAY"))
    return "EWALLET";
  return c;
}

function feeConfigForPayment(cfgJson: string | null | undefined, method: string | null | undefined) {
  const list = parsePaymentMethods(cfgJson);
  const m = toBroadMethod(method);
  const direct = list.find((x) => x.code === m) ?? null;
  return direct ? { feeBps: direct.feeBps, feeFlat: direct.feeFlat } : { feeBps: 0, feeFlat: 0 };
}

function feeConfigFromPaymentSnapshot(payment: { invoiceFeeBps?: number | null; invoiceFeeFlat?: number | null }) {
  const bps = Math.max(0, Math.min(10_000, Math.round(Number(payment.invoiceFeeBps ?? 0) || 0)));
  const flat = Math.max(0, Math.round(Number(payment.invoiceFeeFlat ?? 0) || 0));
  return bps > 0 || flat > 0 ? { feeBps: bps, feeFlat: flat } : null;
}

async function getSmtpConfig(): Promise<SmtpConfig> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const host = cfg?.smtpHost ?? process.env.SMTP_HOST ?? "";
  const portRaw = cfg?.smtpPort ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
  const secure = typeof cfg?.smtpSecure === "boolean" ? cfg.smtpSecure : process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : true;
  const user = cfg?.smtpUser ?? process.env.SMTP_USER ?? "";
  const password = cfg?.smtpPassword ?? process.env.SMTP_PASSWORD ?? "";
  const fromName = cfg?.smtpFromName ?? process.env.SMTP_FROM_NAME ?? "Woodforest Jayagiri 48";
  const notify = cfg?.paymentNotifyEmails ?? process.env.PAYMENT_NOTIFY_EMAILS ?? "";
  const port = typeof portRaw === "number" && Number.isFinite(portRaw) ? portRaw : secure ? 465 : 587;

  if (!host || !user || !password) throw new Error("SMTP belum dikonfigurasi");

  return {
    host,
    port,
    secure,
    user,
    password,
    fromName,
    notifyEmails: parseEmails(notify),
  };
}

async function getSmtpConfigOrNull() {
  try {
    return await getSmtpConfig();
  } catch {
    return null;
  }
}

async function sendEmail(smtp: SmtpConfig, params: { to: string | string[]; subject: string; html: string }) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
  });
  const from = smtp.fromName ? `"${smtp.fromName.replace(/"/g, "")}" <${smtp.user}>` : smtp.user;
  await transporter.sendMail({ from, to: params.to, subject: params.subject, html: params.html });
}

export async function sendSmtpTestEmail(to: string) {
  const smtp = await getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
  });
  await transporter.verify();
  const from = smtp.fromName ? `"${smtp.fromName.replace(/"/g, "")}" <${smtp.user}>` : smtp.user;
  await transporter.sendMail({
    from,
    to,
    subject: "Test SMTP - Woodforest Jayagiri 48",
    html: `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">
      <div style="font-weight:700">Test email berhasil</div>
      <div style="margin-top:6px;color:#374151">Jika kamu menerima email ini, konfigurasi SMTP sudah benar.</div>
    </div>`,
  });
  return { ok: true };
}

export async function sendBalanceReminder(bookingId: string) {
  const smtp = await getSmtpConfigOrNull();
  if (!smtp) return { ok: true, skipped: true };

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: true,
      payment: true,
      items: { include: { unit: true } },
      addOns: { include: { addOn: true } },
      kavlings: { include: { kavling: true } },
    },
  });
  if (!booking || !booking.payment || booking.payment.status === "paid") return { ok: true };
  if (!booking.customer.email) return { ok: true, skipped: true };

  const outstanding = booking.payment.amount - booking.payment.paidAmount;
  if (outstanding <= 0) return { ok: true };

  const dueAt = new Date(booking.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000);
  const endOfDueAt = dueAt.getTime() + 24 * 60 * 60 * 1000 - 1;
  const overdue = Date.now() > endOfDueAt;

  const stage = booking.payment.paidAmount > 0 ? "dp_received" : "dp_not_paid";
  const dueText = formatDateWIB(dueAt);
  const paidText = formatIDR(booking.payment.paidAmount);
  const totalText = formatIDR(booking.payment.amount);
  const remainingText = formatIDR(outstanding);

  const notice =
    stage === "dp_received"
      ? overdue
        ? {
            title: "Pelunasan terlambat",
            body:
              `DP sudah diterima: ${paidText}\n` +
              `Sisa tagihan: ${remainingText}\n` +
              `Jatuh tempo pelunasan: ${dueText} (sudah lewat)\n\n` +
              `Mohon segera selesaikan pembayaran agar booking tetap aman. Jika ingin reschedule, silakan hubungi admin.`,
          }
        : {
            title: "Reminder pelunasan",
            body:
              `DP sudah diterima: ${paidText}\n` +
              `Sisa tagihan: ${remainingText}\n` +
              `Jatuh tempo pelunasan: ${dueText}\n\n` +
              `Silakan selesaikan pembayaran sebelum jatuh tempo.`,
          }
      : {
          title: "Reminder DP / pembayaran awal",
          body:
            `Total tagihan: ${totalText}\n` +
            `Jatuh tempo pelunasan: ${dueText}\n\n` +
            `Silakan lakukan pembayaran awal (DP) untuk mengamankan booking.`,
        };

  const feeCfg =
    feeConfigFromPaymentSnapshot(booking.payment) ?? feeConfigForPayment(cfg?.xenditPaymentMethodsJson, booking.payment.method ?? null);
  const model: InvoiceEmailModel = {
    booking: {
      code: booking.code,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      totalGuest: booking.totalGuest,
      specialRequest: booking.specialRequest,
      customer: { name: booking.customer.name, phone: booking.customer.phone, email: booking.customer.email },
      items: booking.items.map((it) => ({ name: it.unit.name, quantity: it.quantity })),
      addOns: booking.addOns.map((it) => ({ name: it.addOn.name, quantity: it.quantity, price: it.addOn.price })),
      kavlings: booking.kavlings.map((x) => x.kavling.number),
    },
    payment: {
      amount: booking.payment.amount,
      paidAmount: booking.payment.paidAmount,
      dpPlannedAmount: booking.payment.dpPlannedAmount ?? 0,
      serviceFeeAmount: booking.payment.serviceFeeAmount ?? 0,
      dueAt,
      feeBps: feeCfg.feeBps,
      feeFlat: feeCfg.feeFlat,
      paidAt: booking.payment.paidAt,
      method: booking.payment.method,
      checkoutUrl: booking.payment.checkoutUrl,
    },
    notice,
  };

  const html = renderInvoiceEmailHtml(model);
  const subject =
    stage === "dp_received"
      ? overdue
        ? `PELUNASAN TERLAMBAT: Booking ${booking.code} - Woodforest Jayagiri 48`
        : `Reminder Pelunasan: Booking ${booking.code} - Woodforest Jayagiri 48`
      : `Reminder DP: Booking ${booking.code} - Woodforest Jayagiri 48`;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
  });
  const from = smtp.fromName ? `"${smtp.fromName.replace(/"/g, "")}" <${smtp.user}>` : smtp.user;
  await transporter.sendMail({ from, to: booking.customer.email, subject, html });

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { balanceReminderSentAt: new Date() } }),
    prisma.paymentTransaction.create({
      data: {
        paymentId: booking.payment.id,
        action: "email_reminder_sent",
        amountDelta: 0,
        paidAmountBefore: booking.payment.paidAmount,
        paidAmountAfter: booking.payment.paidAmount,
        method: "smtp",
      },
    }),
  ]);
  return { ok: true };
}

export async function processBalanceReminders() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const days = cfg?.balanceReminderDays ?? 7;
  if (days <= 0) return { ok: true, skipped: true };

  const targetDate = new Date();
  targetDate.setHours(0, 0, 0, 0);
  targetDate.setDate(targetDate.getDate() + days);

  const endTargetDate = new Date(targetDate);
  endTargetDate.setHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      checkIn: { gte: targetDate, lte: endTargetDate },
      status: { not: "cancelled" },
      balanceReminderSentAt: null,
      payment: { status: { not: "paid" } },
    },
  });

  for (const b of bookings) {
    try {
      await sendBalanceReminder(b.id);
    } catch (e) {
      console.error(`Gagal kirim reminder ${b.code}:`, e);
    }
  }

  return { ok: true, count: bookings.length };
}

export async function maybeSendPaidEmails(paymentId: string) {
  const smtp = await getSmtpConfigOrNull();
  if (!smtp) return { ok: true, skipped: true };

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          customer: true,
          items: { include: { unit: true } },
          addOns: { include: { addOn: true } },
          kavlings: { include: { kavling: true } },
        },
      },
    },
  });
  if (!payment) return { ok: false };
  if (payment.status !== "paid") return { ok: true };

  const dueAt = new Date(payment.booking.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000);
  const feeCfg = feeConfigFromPaymentSnapshot(payment) ?? feeConfigForPayment(cfg?.xenditPaymentMethodsJson, payment.method ?? null);
  const alreadyInvoice = await prisma.paymentTransaction.findFirst({ where: { paymentId, action: "email_invoice_sent" } });
  const alreadyAdmin = await prisma.paymentTransaction.findFirst({ where: { paymentId, action: "email_admin_notified" } });

  const invoiceModel: InvoiceEmailModel = {
    booking: {
      code: payment.booking.code,
      checkIn: payment.booking.checkIn,
      checkOut: payment.booking.checkOut,
      totalGuest: payment.booking.totalGuest,
      specialRequest: payment.booking.specialRequest ?? null,
      customer: {
        name: payment.booking.customer.name,
        phone: payment.booking.customer.phone,
        email: payment.booking.customer.email ?? "",
      },
      items: payment.booking.items.map((it) => ({ name: it.unit.name, quantity: it.quantity })),
      addOns: payment.booking.addOns.map((x) => ({ name: x.addOn.name, quantity: x.quantity, price: x.addOn.price })),
      kavlings: payment.booking.kavlings.map((x) => x.kavling.number),
    },
    payment: {
      amount: payment.amount,
      paidAmount: payment.paidAmount,
      dpPlannedAmount: payment.dpPlannedAmount ?? 0,
      serviceFeeAmount: payment.serviceFeeAmount ?? 0,
      dueAt,
      feeBps: feeCfg.feeBps,
      feeFlat: feeCfg.feeFlat,
      paidAt: payment.paidAt,
      method: payment.method ?? null,
      checkoutUrl: payment.checkoutUrl,
    },
  };

  const before = payment.paidAmount ?? 0;

  if (!alreadyInvoice && invoiceModel.booking.customer.email) {
    const html = renderInvoiceEmailHtml(invoiceModel);
    await sendEmail(smtp, {
      to: invoiceModel.booking.customer.email,
      subject: `Invoice Booking ${invoiceModel.booking.code} - Pembayaran Berhasil`,
      html,
    });
    await prisma.paymentTransaction.create({
      data: {
        paymentId,
        action: "email_invoice_sent",
        amountDelta: 0,
        paidAmountBefore: before,
        paidAmountAfter: before,
        method: "smtp",
      },
    });
  }

  if (!alreadyAdmin) {
    const targets = smtp.notifyEmails ?? [];
    if (targets.length) {
      const html = renderInvoiceEmailHtml(invoiceModel);
      await sendEmail(smtp, {
        to: targets,
        subject: `Payment PAID: ${invoiceModel.booking.code}`,
        html,
      });
      await prisma.paymentTransaction.create({
        data: {
          paymentId,
          action: "email_admin_notified",
          amountDelta: 0,
          paidAmountBefore: before,
          paidAmountAfter: before,
          method: "smtp",
        },
      });
    }
  }

  return { ok: true };
}

export async function maybeSendDpReceivedEmails(paymentId: string) {
  const smtp = await getSmtpConfigOrNull();
  if (!smtp) return { ok: true, skipped: true };

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          customer: true,
          items: { include: { unit: true } },
          addOns: { include: { addOn: true } },
          kavlings: { include: { kavling: true } },
        },
      },
    },
  });
  if (!payment) return { ok: false };

  const outstanding = payment.amount - payment.paidAmount;
  if (payment.paidAmount <= 0) return { ok: true };
  if (outstanding <= 0) return { ok: true };

  const alreadyCustomer = await prisma.paymentTransaction.findFirst({ where: { paymentId, action: "email_dp_received_sent" } });
  const alreadyAdmin = await prisma.paymentTransaction.findFirst({ where: { paymentId, action: "email_admin_dp_received_notified" } });

  const dueAt = new Date(payment.booking.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000);
  const feeCfg = feeConfigFromPaymentSnapshot(payment) ?? feeConfigForPayment(cfg?.xenditPaymentMethodsJson, payment.method ?? null);
  const invoiceModel: InvoiceEmailModel = {
    booking: {
      code: payment.booking.code,
      checkIn: payment.booking.checkIn,
      checkOut: payment.booking.checkOut,
      totalGuest: payment.booking.totalGuest,
      specialRequest: payment.booking.specialRequest ?? null,
      customer: {
        name: payment.booking.customer.name,
        phone: payment.booking.customer.phone,
        email: payment.booking.customer.email ?? "",
      },
      items: payment.booking.items.map((it) => ({ name: it.unit.name, quantity: it.quantity })),
      addOns: payment.booking.addOns.map((x) => ({ name: x.addOn.name, quantity: x.quantity, price: x.addOn.price })),
      kavlings: payment.booking.kavlings.map((x) => x.kavling.number),
    },
    payment: {
      amount: payment.amount,
      paidAmount: payment.paidAmount,
      dpPlannedAmount: payment.dpPlannedAmount ?? 0,
      serviceFeeAmount: payment.serviceFeeAmount ?? 0,
      dueAt,
      feeBps: feeCfg.feeBps,
      feeFlat: feeCfg.feeFlat,
      paidAt: payment.paidAt,
      method: payment.method ?? null,
      checkoutUrl: payment.checkoutUrl,
    },
    notice: {
      title: "DP diterima",
      body:
        `DP sudah kami terima: ${formatIDR(payment.paidAmount)}\n` +
        `Sisa tagihan: ${formatIDR(outstanding)}\n` +
        `Jatuh tempo pelunasan: ${formatDateWIB(dueAt)}\n\n` +
        `Silakan selesaikan pelunasan sebelum jatuh tempo. Terima kasih!`,
    },
  };

  const before = payment.paidAmount ?? 0;

  if (!alreadyCustomer && invoiceModel.booking.customer.email) {
    const html = renderInvoiceEmailHtml(invoiceModel);
    await sendEmail(smtp, {
      to: invoiceModel.booking.customer.email,
      subject: `Konfirmasi DP: Booking ${invoiceModel.booking.code} - Woodforest Jayagiri 48`,
      html,
    });
    await prisma.paymentTransaction.create({
      data: {
        paymentId,
        action: "email_dp_received_sent",
        amountDelta: 0,
        paidAmountBefore: before,
        paidAmountAfter: before,
        method: "smtp",
      },
    });
  }

  if (!alreadyAdmin) {
    const targets = smtp.notifyEmails ?? [];
    if (targets.length) {
      const html = renderInvoiceEmailHtml(invoiceModel);
      await sendEmail(smtp, {
        to: targets,
        subject: `DP RECEIVED: ${invoiceModel.booking.code}`,
        html,
      });
      await prisma.paymentTransaction.create({
        data: {
          paymentId,
          action: "email_admin_dp_received_notified",
          amountDelta: 0,
          paidAmountBefore: before,
          paidAmountAfter: before,
          method: "smtp",
        },
      });
    }
  }

  return { ok: true };
}

export async function maybeSendPaymentLinkEmails(paymentId: string, kind: "dp" | "balance") {
  const smtp = await getSmtpConfigOrNull();
  if (!smtp) return { ok: true, skipped: true };

  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const balanceDueDays = Math.max(0, cfg?.balanceReminderDays ?? 7);

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: {
          customer: true,
          items: { include: { unit: true } },
          addOns: { include: { addOn: true } },
          kavlings: { include: { kavling: true } },
        },
      },
    },
  });
  if (!payment) return { ok: false };

  const to = (payment.booking.customer.email ?? "").trim();
  if (!to) return { ok: true, skipped: true };

  const dueAt = new Date(payment.booking.checkIn.getTime() - balanceDueDays * 24 * 60 * 60 * 1000);
  const feeCfg = feeConfigFromPaymentSnapshot(payment) ?? feeConfigForPayment(cfg?.xenditPaymentMethodsJson, payment.method ?? null);

  const outstanding = payment.amount - payment.paidAmount;
  if (outstanding <= 0) return { ok: true, skipped: true };
  if (!payment.checkoutUrl) return { ok: true, skipped: true };

  const externalId = (payment.gatewayExternalId ?? "").trim();
  const idempotencyKey = `email_payment_link_sent:${kind}:${externalId || payment.checkoutUrl}`;
  const already = await prisma.paymentTransaction.findFirst({ where: { paymentId, action: idempotencyKey }, select: { id: true } });
  if (already) return { ok: true, skipped: true };

  const title = kind === "dp" ? "Link Pembayaran DP" : "Link Pembayaran Pelunasan";
  const body =
    kind === "dp"
      ? `Silakan lakukan pembayaran DP untuk booking ${payment.booking.code}.\n\n` + `Klik tombol "Bayar Sekarang" di email ini untuk melanjutkan pembayaran.`
      : `Silakan selesaikan pelunasan untuk booking ${payment.booking.code} sebelum jatuh tempo.\n\n` +
        `Sisa tagihan: ${formatIDR(outstanding)}\n` +
        `Jatuh tempo: ${formatDateWIB(dueAt)}\n\n` +
        `Klik tombol "Bayar Sekarang" di email ini untuk melanjutkan pembayaran.`;

  const invoiceModel: InvoiceEmailModel = {
    booking: {
      code: payment.booking.code,
      checkIn: payment.booking.checkIn,
      checkOut: payment.booking.checkOut,
      totalGuest: payment.booking.totalGuest,
      specialRequest: payment.booking.specialRequest ?? null,
      customer: {
        name: payment.booking.customer.name,
        phone: payment.booking.customer.phone,
        email: payment.booking.customer.email ?? "",
      },
      items: payment.booking.items.map((it) => ({ name: it.unit.name, quantity: it.quantity })),
      addOns: payment.booking.addOns.map((x) => ({ name: x.addOn.name, quantity: x.quantity, price: x.addOn.price })),
      kavlings: payment.booking.kavlings.map((x) => x.kavling.number),
    },
    payment: {
      amount: payment.amount,
      paidAmount: payment.paidAmount,
      dpPlannedAmount: payment.dpPlannedAmount ?? 0,
      serviceFeeAmount: payment.serviceFeeAmount ?? 0,
      dueAt,
      feeBps: feeCfg.feeBps,
      feeFlat: feeCfg.feeFlat,
      paidAt: payment.paidAt,
      method: payment.method ?? null,
      checkoutUrl: payment.checkoutUrl,
    },
    notice: { title, body },
  };

  const html = renderInvoiceEmailHtml(invoiceModel);
  await sendEmail(smtp, { to, subject: `${title}: Booking ${payment.booking.code} - Woodforest Jayagiri 48`, html });
  await prisma.paymentTransaction.create({
    data: {
      paymentId,
      action: idempotencyKey,
      amountDelta: 0,
      paidAmountBefore: payment.paidAmount ?? 0,
      paidAmountAfter: payment.paidAmount ?? 0,
      method: "smtp",
    },
  });

  return { ok: true };
}
