import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { xenditPaymentMethodsJson: true } });
  const defaults = [
    { code: "BANK_TRANSFER", label: "Transfer Bank (VA)" },
    { code: "CREDIT_CARD", label: "Kartu (Credit/Debit)" },
    { code: "EWALLET", label: "E-Wallet" },
    { code: "QRIS", label: "QRIS" },
    { code: "RETAIL_OUTLET", label: "Retail Outlet" },
    { code: "DIRECT_DEBIT", label: "Direct Debit" },
    { code: "PAYLATER", label: "Paylater" },
    { code: "QR_CODE", label: "QR Code" },
  ];
  const parsed = parsePaymentMethods(cfg?.xenditPaymentMethodsJson);
  const byCode = new Map(parsed.map((m) => [m.code, m] as const));
  const items = defaults
    .map((d) => {
      const v = byCode.get(d.code);
      if (!v?.enabled) return null;
      return { code: d.code, label: d.label, feeFlat: v.feeFlat, feeBps: v.feeBps };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return NextResponse.json(
    { items },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

