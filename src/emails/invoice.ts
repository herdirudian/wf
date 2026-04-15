import { formatIDR } from "@/lib/format";
import { formatDateWIB } from "@/lib/time";

export type InvoiceEmailModel = {
  booking: {
    code: string;
    checkIn: Date;
    checkOut: Date;
    totalGuest: number;
    specialRequest: string | null;
    customer: { name: string; phone: string; email: string };
    items: Array<{ name: string; quantity: number }>;
    addOns: Array<{ name: string; quantity: number; price: number }>;
    kavlings: number[];
  };
  payment: {
    amount: number;
    paidAmount: number;
    dpPlannedAmount?: number;
    serviceFeeAmount?: number;
    dueAt?: Date | null;
    feeBps?: number;
    feeFlat?: number;
    paidAt: Date | null;
    method: string | null;
    checkoutUrl?: string | null;
  };
  notice?: { title: string; body: string } | null;
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

export function renderInvoiceEmailHtml(model: InvoiceEmailModel) {
  const booking = model.booking;
  const payment = model.payment;
  const notice = model.notice ?? null;
  const remainingAmount = Math.max(0, payment.amount - payment.paidAmount);
  const isPaid = payment.paidAmount >= payment.amount && payment.amount > 0;
  const dpPlannedAmount = Math.max(0, Math.round(Number(payment.dpPlannedAmount ?? 0) || 0));
  const dpPending = dpPlannedAmount > 0 && payment.paidAmount <= 0 && !isPaid;
  const dpReceived = payment.paidAmount > 0 && payment.paidAmount < payment.amount;
  const statusLabel = isPaid ? "Confirmed" : dpReceived ? "DP Received" : dpPending ? "DP Pending" : "Pending";
  const statusColor = isPaid ? "#065f46" : dpReceived || dpPending ? "#1d4ed8" : "#92400e";
  const feePaid = Math.max(0, Math.round(Number(payment.serviceFeeAmount ?? 0) || 0));
  const grossPaid = Math.max(0, payment.paidAmount + feePaid);
  const feeBps = Math.max(0, Math.min(10_000, Math.round(Number(payment.feeBps ?? 0) || 0)));
  const feeFlat = Math.max(0, Math.round(Number(payment.feeFlat ?? 0) || 0));
  const feeEstimateRemaining = remainingAmount > 0 ? Math.max(0, Math.round((remainingAmount * feeBps) / 10_000)) + feeFlat : 0;
  const grossRemainingEstimate = remainingAmount + feeEstimateRemaining;
  const addOnAmount = booking.addOns.reduce((acc, a) => acc + a.quantity * a.price, 0);
  const baseAmount = Math.max(0, payment.amount - addOnAmount);
  const itemRows = booking.items
    .map((it) => `<tr><td>${esc(it.name)}</td><td style="text-align:right">x${it.quantity}</td></tr>`)
    .join("");
  const addonRows = booking.addOns.length
    ? booking.addOns
        .map(
          (a) =>
            `<tr><td>${esc(a.name)} <span style="color:#6b7280;font-size:12px">(${esc(formatIDR(a.price))})</span></td><td style="text-align:right">x${a.quantity}</td></tr>`,
        )
        .join("")
    : `<tr><td style="color:#6b7280" colspan="2">-</td></tr>`;

  const kavlingText = booking.kavlings.length ? booking.kavlings.slice().sort((a, b) => a - b).join(", ") : "-";
  const paidAt = payment.paidAt ? `${formatDateWIB(payment.paidAt)} WIB` : "-";
  const checkInText = formatDateWIB(booking.checkIn);
  const checkOutText = formatDateWIB(booking.checkOut);
  const dueText = payment.dueAt ? formatDateWIB(payment.dueAt) : "-";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${esc(booking.code)}</title>
    <style>
      @media print {
        @page { size: A4; margin: 8mm; }
        body { background: #ffffff !important; }
        .wf-wrap { padding: 0 !important; }
        .wf-card { border: 0 !important; }
        .wf-nobreak { page-break-inside: avoid; break-inside: avoid; }
        .wf-hide-print { display: block !important; }
        .wf-tight { padding: 10px !important; }
        .wf-cardBlock { page-break-inside: avoid; break-inside: avoid; }
        .wf-print-title { font-size: 18px !important; }
        .wf-print-tagline { font-size: 10px !important; letter-spacing: 0.8px !important; }
        .wf-print-meta { font-size: 11px !important; }
        table, tr, td { break-inside: auto; page-break-inside: auto; }
      }
    </style>
  </head>
  <body style="margin:0;background:#f3f4f6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111827">
    <div class="wf-wrap" style="max-width:760px;margin:0 auto;padding:24px">
      <div class="wf-card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:22px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td style="text-align:center;padding-bottom:14px">
              <div class="wf-print-title" style="font-size:22px;font-weight:800;letter-spacing:0.2px">Woodforest Jayagiri 48</div>
              <div class="wf-print-tagline" style="font-size:11px;letter-spacing:1.2px;color:#6b7280;margin-top:4px">Quiet nature • Family bonding • Wellness • Light adventure</div>
              <div class="wf-print-meta" style="font-size:12px;color:#6b7280;margin-top:10px">
                <span style="white-space:nowrap">admin@woodforestjayagiri48.com</span>
                <span style="margin:0 10px;color:#d1d5db">|</span>
                <span style="white-space:nowrap">+62 811-2090-808</span>
              </div>
              <div class="wf-print-meta" style="font-size:11px;color:#6b7280;margin-top:8px">Jam check-in 14:00 WIB • Check-out 12:00 WIB • Tunjukkan Booking ID saat check-in</div>
            </td>
          </tr>
        </table>

        ${
          notice
            ? `<div style="margin-top:10px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:12px">
              <div style="font-size:12px;font-weight:800;color:#92400e">${esc(notice.title)}</div>
              <div style="margin-top:6px;font-size:12px;line-height:1.5;color:#92400e;white-space:pre-wrap">${esc(notice.body)}</div>
            </div>`
            : ""
        }

        <div style="height:1px;background:#e5e7eb;margin:8px 0 12px"></div>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse" class="wf-nobreak">
          <tr>
            <td style="padding-bottom:12px">
              <div style="font-size:14px;font-weight:800">Invoice / Booking Confirmation</div>
              <div style="font-size:12px;color:#6b7280;margin-top:6px">Dear ${esc(booking.customer.name)},</div>
              <div style="font-size:12px;color:#6b7280;margin-top:4px">
                Terima kasih telah memilih Woodforest Jayagiri 48. Berikut detail booking Anda.
              </div>
            </td>
            <td style="padding-bottom:12px;text-align:right;vertical-align:top">
              <div style="font-size:12px;color:#6b7280">Booking ID</div>
              <div style="font-size:14px;font-weight:800">${esc(booking.code)}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:6px">Status</div>
              <div style="font-size:13px;font-weight:800;color:${statusColor}">${esc(statusLabel)}</div>
            </td>
          </tr>
        </table>

        <div style="height:1px;background:#e5e7eb;margin:8px 0 12px"></div>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td style="width:60%;vertical-align:top;padding-right:12px">
              <div class="wf-tight wf-cardBlock" style="border:1px solid #e5e7eb;border-radius:12px;padding:14px">
                <div style="font-size:13px;font-weight:800;margin-bottom:10px">Detail Booking</div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Item</div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
                  <tbody>
                    ${itemRows}
                  </tbody>
                </table>

                <div style="height:1px;background:#eef2f7;margin:12px 0"></div>

                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
                  <tr>
                    <td style="color:#6b7280">Nama</td>
                    <td style="text-align:right;font-weight:700">${esc(booking.customer.name)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding-top:6px">Kontak</td>
                    <td style="text-align:right;padding-top:6px">${esc(booking.customer.phone)} · ${esc(booking.customer.email)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding-top:6px">Check-in</td>
                    <td style="text-align:right;padding-top:6px;font-weight:700">${esc(checkInText)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding-top:6px">Check-out</td>
                    <td style="text-align:right;padding-top:6px;font-weight:700">${esc(checkOutText)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding-top:6px">Guest</td>
                    <td style="text-align:right;padding-top:6px">${booking.totalGuest}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding-top:6px">Kavling</td>
                    <td style="text-align:right;padding-top:6px">${esc(kavlingText)}</td>
                  </tr>
                </table>

                ${
                  booking.specialRequest
                    ? `<div style="height:1px;background:#eef2f7;margin:12px 0"></div>
                <div class="wf-hide-print">
                  <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Special Request</div>
                  <div style="font-size:13px;white-space:pre-wrap">${esc(booking.specialRequest)}</div>
                </div>`
                    : ""
                }

                <div style="height:1px;background:#eef2f7;margin:12px 0"></div>
                <div class="wf-hide-print">
                  <div style="font-size:12px;font-weight:800;margin-bottom:6px">Cancellation Policy</div>
                  <div style="font-size:12px;color:#6b7280;line-height:1.5">
                    Pembatalan dapat dikenakan biaya sesuai kebijakan. Silakan hubungi admin untuk detail kebijakan pembatalan.
                  </div>
                </div>
              </div>
            </td>

            <td style="width:40%;vertical-align:top;padding-left:12px">
              <div class="wf-tight wf-cardBlock" style="border:1px solid #e5e7eb;border-radius:12px;padding:14px">
                <div style="font-size:13px;font-weight:800;margin-bottom:10px">Ringkasan Pembayaran</div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Room / Paket</td>
                    <td style="text-align:right;padding:6px 0">${esc(formatIDR(baseAmount))}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Add-Ons</td>
                    <td style="text-align:right;padding:6px 0">${esc(formatIDR(addOnAmount))}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="height:1px;background:#eef2f7"></td>
                  </tr>
                  <tr>
                    <td style="font-weight:800;padding:10px 0">Total pembayaran</td>
                    <td style="text-align:right;font-weight:800;padding:10px 0">${esc(formatIDR(payment.amount))}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Biaya layanan (dibayar)</td>
                    <td style="text-align:right;padding:6px 0">${esc(formatIDR(feePaid))}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Total dibayar</td>
                    <td style="text-align:right;padding:6px 0">${esc(formatIDR(grossPaid))}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Sisa pembayaran</td>
                    <td style="text-align:right;padding:6px 0;font-weight:800">${esc(formatIDR(grossRemainingEstimate))}</td>
                  </tr>
                  ${dpPlannedAmount > 0 && payment.paidAmount <= 0 ? `<tr>
                    <td style="color:#6b7280;padding:6px 0">DP yang harus dibayar</td>
                    <td style="text-align:right;padding:6px 0;font-weight:800;color:#1d4ed8">${esc(formatIDR(dpPlannedAmount))}</td>
                  </tr>` : ""}
                  ${remainingAmount > 0 && (feeBps > 0 || feeFlat > 0) ? `<tr>
                    <td style="color:#6b7280;padding:6px 0">Biaya layanan pelunasan (estimasi)</td>
                    <td style="text-align:right;padding:6px 0">${esc(formatIDR(feeEstimateRemaining))}</td>
                  </tr>` : ""}
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Jatuh tempo pelunasan</td>
                    <td style="text-align:right;padding:6px 0">${esc(dueText)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Paid at</td>
                    <td style="text-align:right;padding:6px 0">${esc(paidAt)}</td>
                  </tr>
                  <tr>
                    <td style="color:#6b7280;padding:6px 0">Metode</td>
                    <td style="text-align:right;padding:6px 0">${esc(payment.method ?? "-")}</td>
                  </tr>
                </table>

                ${
                  payment.checkoutUrl && payment.paidAmount < payment.amount
                    ? `<div style="margin-top:14px;text-align:center">
                  <a href="${esc(payment.checkoutUrl)}" style="display:inline-block;background:#059669;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:800;font-size:13px">Bayar Sekarang</a>
                  <div style="margin-top:8px;font-size:11px;color:#6b7280;line-height:1.4">Klik tombol untuk menyelesaikan pembayaran sisa tagihan.</div>
                </div>`
                    : ""
                }
              </div>

              <div class="wf-hide-print" style="margin-top:12px;border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#f9fafb">
                <div style="font-size:11px;color:#6b7280;line-height:1.5">
                  Simpan email ini sebagai bukti booking. Tunjukkan Booking ID saat check-in.
                </div>
              </div>
            </td>
          </tr>
        </table>

        <div class="wf-hide-print" style="margin-top:16px;font-size:11px;color:#6b7280">
          Email ini dikirim otomatis. Jika ada pertanyaan, balas email ini.
        </div>
      </div>
    </div>
  </body>
</html>`;
}
