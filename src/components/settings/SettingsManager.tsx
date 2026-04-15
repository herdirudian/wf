"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

export function SettingsManager({ currentUserRole }: { currentUserRole: string }) {
  const isOwner = currentUserRole === "owner";
  const defaultXenditPaymentMethods = [
    { code: "BANK_TRANSFER", label: "Transfer Bank (VA)", enabled: true, feeFlat: 4000, feeBps: 0 },
    { code: "CREDIT_CARD", label: "Kartu (Credit/Debit)", enabled: true, feeFlat: 2000, feeBps: 290 },
    { code: "EWALLET", label: "E-Wallet", enabled: true, feeFlat: 0, feeBps: 150 },
    { code: "QRIS", label: "QRIS", enabled: true, feeFlat: 0, feeBps: 70 },
    { code: "RETAIL_OUTLET", label: "Retail Outlet", enabled: true, feeFlat: 5000, feeBps: 0 },
    { code: "DIRECT_DEBIT", label: "Direct Debit", enabled: false, feeFlat: 0, feeBps: 190 },
    { code: "PAYLATER", label: "Paylater", enabled: false, feeFlat: 0, feeBps: 230 },
    { code: "QR_CODE", label: "QR Code", enabled: false, feeFlat: 0, feeBps: 70 },
  ];
  const [kavlingSellCount, setKavlingSellCount] = useState(110);
  const [privateKavlingStart, setPrivateKavlingStart] = useState(58);
  const [privateKavlingEnd, setPrivateKavlingEnd] = useState(65);
  const [holdMinutes, setHoldMinutes] = useState(5);
  const [balanceReminderDays, setBalanceReminderDays] = useState(3);
  const [xenditSecretKeySet, setXenditSecretKeySet] = useState(false);
  const [xenditCallbackTokenSet, setXenditCallbackTokenSet] = useState(false);
  const [xenditSecretKeyInput, setXenditSecretKeyInput] = useState("");
  const [xenditCallbackTokenInput, setXenditCallbackTokenInput] = useState("");
  const [xenditPaymentMethods, setXenditPaymentMethods] = useState<
    Array<{ code: string; label: string; enabled: boolean; feeFlat: number; feeBps: number }>
  >(() => defaultXenditPaymentMethods);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<number | "">("");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");
  const [paymentNotifyEmails, setPaymentNotifyEmails] = useState("");
  const [dpPercent, setDpPercent] = useState(50);
  const [dpMinAmount, setDpMinAmount] = useState(500000);
  const [reminderDays, setReminderDays] = useState("7,3,0,-1");
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpTestSending, setSmtpTestSending] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);
  const [siteMapFile, setSiteMapFile] = useState<File | null>(null);
  const [siteMapUploading, setSiteMapUploading] = useState(false);
  const [siteMapVersion, setSiteMapVersion] = useState(0);
  const [siteMapCropOpen, setSiteMapCropOpen] = useState(false);
  const [siteMapCropSrc, setSiteMapCropSrc] = useState<string | null>(null);
  const [siteMapCropNatural, setSiteMapCropNatural] = useState<{ w: number; h: number } | null>(null);
  const [siteMapCropRect, setSiteMapCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const siteMapCropImgRef = useRef<HTMLImageElement | null>(null);
  const siteMapCropDragRef = useRef<
    null | {
      kind: "move" | "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      rect: { x: number; y: number; w: number; h: number };
    }
  >(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSiteMapVersion(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/dashboard/config");
      const data = (await res.json().catch(() => null)) as
        | {
            config?: {
              kavlingSellCount?: number;
              privateKavlingStart?: number;
              privateKavlingEnd?: number;
              holdMinutes?: number;
              xenditSecretKeySet?: boolean;
              xenditCallbackTokenSet?: boolean;
              xenditPaymentMethods?: Array<{ code?: string; enabled?: boolean; feeFlat?: number; feeBps?: number; serviceFee?: number }>;
              smtpHost?: string;
              smtpPort?: number | null;
              smtpSecure?: boolean;
              smtpUser?: string;
              smtpFromName?: string;
              smtpPasswordSet?: boolean;
              paymentNotifyEmails?: string;
              balanceReminderDays?: number;
              dpPercent?: number;
              dpMinAmount?: number;
              reminderDays?: string;
            };
            message?: string;
          }
        | null;
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        setError(data?.message ?? "Gagal load pengaturan");
        return;
      }
      const v = data?.config?.kavlingSellCount;
      if (typeof v === "number" && Number.isFinite(v)) setKavlingSellCount(v);
      const ps = data?.config?.privateKavlingStart;
      if (typeof ps === "number" && Number.isFinite(ps)) setPrivateKavlingStart(ps);
      const pe = data?.config?.privateKavlingEnd;
      if (typeof pe === "number" && Number.isFinite(pe)) setPrivateKavlingEnd(pe);
      const hm = data?.config?.holdMinutes;
      if (typeof hm === "number" && Number.isFinite(hm)) setHoldMinutes(hm);
      setXenditSecretKeySet(!!data?.config?.xenditSecretKeySet);
      setXenditCallbackTokenSet(!!data?.config?.xenditCallbackTokenSet);
      const methods = Array.isArray(data?.config?.xenditPaymentMethods) ? data!.config!.xenditPaymentMethods! : null;
      if (methods) {
        const byCode = new Map(
          methods
            .map((m) => ({
              code: typeof m.code === "string" ? m.code.trim().toUpperCase() : "",
              enabled: !!m.enabled,
              feeFlat: Math.max(0, Math.round(Number(m.feeFlat ?? m.serviceFee ?? 0) || 0)),
              feeBps: Math.max(0, Math.min(10_000, Math.round(Number(m.feeBps ?? 0) || 0))),
            }))
            .filter((m) => m.code)
            .map((m) => [m.code, m] as const),
        );
        setXenditPaymentMethods(
          defaultXenditPaymentMethods.map((d) => {
            const got = byCode.get(d.code);
            return got ? { ...d, enabled: got.enabled, feeFlat: got.feeFlat, feeBps: got.feeBps } : d;
          }),
        );
      } else {
        setXenditPaymentMethods(defaultXenditPaymentMethods);
      }
      setSmtpHost(typeof data?.config?.smtpHost === "string" ? data!.config!.smtpHost : "");
      setSmtpPort(typeof data?.config?.smtpPort === "number" ? data!.config!.smtpPort : "");
      setSmtpSecure(typeof data?.config?.smtpSecure === "boolean" ? data!.config!.smtpSecure : true);
      setSmtpUser(typeof data?.config?.smtpUser === "string" ? data!.config!.smtpUser : "");
      setSmtpFromName(typeof data?.config?.smtpFromName === "string" ? data!.config!.smtpFromName : "");
      setSmtpPasswordSet(!!data?.config?.smtpPasswordSet);
      setPaymentNotifyEmails(typeof data?.config?.paymentNotifyEmails === "string" ? data!.config!.paymentNotifyEmails : "");
      const br = data?.config?.balanceReminderDays;
      if (typeof br === "number" && Number.isFinite(br)) setBalanceReminderDays(br);
      const dpp = data?.config?.dpPercent;
      if (typeof dpp === "number" && Number.isFinite(dpp)) setDpPercent(dpp);
      const dpm = data?.config?.dpMinAmount;
      if (typeof dpm === "number" && Number.isFinite(dpm)) setDpMinAmount(dpm);
      if (typeof data?.config?.reminderDays === "string") setReminderDays(data.config.reminderDays);
      setSmtpTestResult(null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/dashboard/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(
          Object.entries({
            kavlingSellCount,
            privateKavlingStart,
            privateKavlingEnd,
            holdMinutes,
            xenditSecretKey: xenditSecretKeyInput.trim() ? xenditSecretKeyInput.trim() : undefined,
            xenditCallbackToken: xenditCallbackTokenInput.trim() ? xenditCallbackTokenInput.trim() : undefined,
            xenditPaymentMethods: xenditPaymentMethods.map((m) => ({
              code: m.code,
              enabled: !!m.enabled,
              feeFlat: Math.max(0, Math.round(Number(m.feeFlat ?? 0) || 0)),
              feeBps: Math.max(0, Math.min(10_000, Math.round(Number(m.feeBps ?? 0) || 0))),
            })),
            smtpHost: smtpHost.trim() ? smtpHost.trim() : undefined,
            smtpPort: typeof smtpPort === "number" ? smtpPort : undefined,
            smtpSecure,
            smtpUser: smtpUser.trim() ? smtpUser.trim() : undefined,
            smtpFromName: smtpFromName.trim() ? smtpFromName.trim() : undefined,
            smtpPassword: smtpPasswordInput.trim() ? smtpPasswordInput.trim() : undefined,
            paymentNotifyEmails: paymentNotifyEmails.trim() ? paymentNotifyEmails.trim() : undefined,
            balanceReminderDays,
            dpPercent,
            dpMinAmount,
            reminderDays: reminderDays.trim(),
          }).filter(([, v]) => typeof v !== "undefined"),
        ),
      ),
    });
    const data = (await res.json().catch(() => null)) as
      | {
          config?: {
            kavlingSellCount?: number;
            privateKavlingStart?: number;
            privateKavlingEnd?: number;
            holdMinutes?: number;
            xenditSecretKeySet?: boolean;
            xenditCallbackTokenSet?: boolean;
            smtpHost?: string;
            smtpPort?: number | null;
            smtpSecure?: boolean;
            smtpUser?: string;
            smtpFromName?: string;
            smtpPasswordSet?: boolean;
            paymentNotifyEmails?: string;
            balanceReminderDays?: number;
            dpPercent?: number;
            dpMinAmount?: number;
            reminderDays?: string;
          };
          message?: string;
        }
      | null;
    if (!res.ok) {
      setSaving(false);
      setError(data?.message ?? "Gagal menyimpan pengaturan");
      return;
    }
    const v = data?.config?.kavlingSellCount;
    if (typeof v === "number" && Number.isFinite(v)) setKavlingSellCount(v);
    const ps = data?.config?.privateKavlingStart;
    if (typeof ps === "number" && Number.isFinite(ps)) setPrivateKavlingStart(ps);
    const pe = data?.config?.privateKavlingEnd;
    if (typeof pe === "number" && Number.isFinite(pe)) setPrivateKavlingEnd(pe);
    const hm = data?.config?.holdMinutes;
    if (typeof hm === "number" && Number.isFinite(hm)) setHoldMinutes(hm);
    setXenditSecretKeySet(!!data?.config?.xenditSecretKeySet);
    setXenditCallbackTokenSet(!!data?.config?.xenditCallbackTokenSet);
    setSmtpHost(typeof data?.config?.smtpHost === "string" ? data!.config!.smtpHost : "");
    setSmtpPort(typeof data?.config?.smtpPort === "number" ? data!.config!.smtpPort : "");
    setSmtpSecure(typeof data?.config?.smtpSecure === "boolean" ? data!.config!.smtpSecure : true);
    setSmtpUser(typeof data?.config?.smtpUser === "string" ? data!.config!.smtpUser : "");
    setSmtpFromName(typeof data?.config?.smtpFromName === "string" ? data!.config!.smtpFromName : "");
    setSmtpPasswordSet(!!data?.config?.smtpPasswordSet);
    setPaymentNotifyEmails(typeof data?.config?.paymentNotifyEmails === "string" ? data!.config!.paymentNotifyEmails : "");
    const brs = data?.config?.balanceReminderDays;
    if (typeof brs === "number" && Number.isFinite(brs)) setBalanceReminderDays(brs);
    const dpp = data?.config?.dpPercent;
    if (typeof dpp === "number" && Number.isFinite(dpp)) setDpPercent(dpp);
    const dpm = data?.config?.dpMinAmount;
    if (typeof dpm === "number" && Number.isFinite(dpm)) setDpMinAmount(dpm);
    if (typeof data?.config?.reminderDays === "string") setReminderDays(data.config.reminderDays);
    setXenditSecretKeyInput("");
    setXenditCallbackTokenInput("");
    setSmtpPasswordInput("");
    setSmtpTestResult(null);
    setSaving(false);
  }

  async function uploadSiteMap(fileOverride?: File) {
    const file = fileOverride ?? siteMapFile;
    if (isOwner || !file) return;
    setSiteMapUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dashboard/kavling-site-map", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; version?: number } | null;
      if (!res.ok) throw new Error(data?.message ?? "Gagal upload site map");
      setSiteMapFile(null);
      setSiteMapVersion(typeof data?.version === "number" ? data.version : Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal upload site map");
    } finally {
      setSiteMapUploading(false);
    }
  }

  function setCropRectFull() {
    if (!siteMapCropNatural) return;
    setSiteMapCropRect({ x: 0, y: 0, w: siteMapCropNatural.w, h: siteMapCropNatural.h });
  }

  function setCropRectCenteredRatio(ratio: number) {
    if (!siteMapCropNatural) return;
    const iw = siteMapCropNatural.w;
    const ih = siteMapCropNatural.h;
    const imgRatio = iw / Math.max(1, ih);
    let w = iw;
    let h = ih;
    if (imgRatio > ratio) {
      h = ih;
      w = Math.round(h * ratio);
    } else {
      w = iw;
      h = Math.round(w / ratio);
    }
    const x = Math.round((iw - w) / 2);
    const y = Math.round((ih - h) / 2);
    setSiteMapCropRect({ x, y, w, h });
  }

  async function openSiteMapCrop(file: File) {
    if (isOwner) return;
    const src = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Gagal membaca file"));
      fr.readAsDataURL(file);
    });
    setSiteMapCropSrc(src);
    setSiteMapCropOpen(true);
    setSiteMapCropNatural(null);
    setSiteMapCropRect(null);
    setSiteMapFile(file);
  }

  async function exportCropAndUpload() {
    const imgEl = siteMapCropImgRef.current;
    if (!imgEl || !siteMapCropNatural || !siteMapCropRect || !siteMapFile) return;
    const sx = Math.max(0, Math.min(siteMapCropNatural.w - 1, Math.round(siteMapCropRect.x)));
    const sy = Math.max(0, Math.min(siteMapCropNatural.h - 1, Math.round(siteMapCropRect.y)));
    const sw = Math.max(1, Math.min(siteMapCropNatural.w - sx, Math.round(siteMapCropRect.w)));
    const sh = Math.max(1, Math.min(siteMapCropNatural.h - sy, Math.round(siteMapCropRect.h)));

    const maxOutW = 2200;
    const outScale = Math.min(1, maxOutW / Math.max(1, sw));
    const ow = Math.max(1, Math.round(sw * outScale));
    const oh = Math.max(1, Math.round(sh * outScale));

    const canvas = document.createElement("canvas");
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Canvas tidak tersedia");
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, ow, oh);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) {
      setError("Gagal membuat hasil crop");
      return;
    }

    const outFile = new File([blob], "site-map.png", { type: "image/png" });
    setSiteMapFile(outFile);
    setSiteMapCropOpen(false);
    await uploadSiteMap(outFile);
    setSiteMapCropSrc(null);
    setSiteMapCropNatural(null);
    setSiteMapCropRect(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted">Pengaturan global untuk sistem booking.</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Pengaturan Kavling</div>
            <div className="mt-1 text-xs text-muted">Berlaku untuk pilihan nomor kavling di halaman booking.</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Hold (menit)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={holdMinutes}
                onChange={(e) => setHoldMinutes(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-28 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Reminder (hari)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={balanceReminderDays}
                onChange={(e) => setBalanceReminderDays(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-28 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Jumlah kavling dijual</label>
              <input
                type="number"
                min={1}
                max={110}
                value={kavlingSellCount}
                onChange={(e) => setKavlingSellCount(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-40 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Private start</label>
              <input
                type="number"
                min={1}
                max={110}
                value={privateKavlingStart}
                onChange={(e) => setPrivateKavlingStart(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-32 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Private end</label>
              <input
                type="number"
                min={1}
                max={110}
                value={privateKavlingEnd}
                onChange={(e) => setPrivateKavlingEnd(Number(e.target.value))}
                disabled={loading || saving || isOwner}
                className="h-9 w-32 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            {!isOwner && (
              <button
                type="button"
                onClick={save}
                disabled={loading || saving}
                className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            )}
          </div>
        </div>
        {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Pengaturan Pembayaran & Reminder</div>
            <div className="mt-1 text-xs text-muted">Persentase DP, minimum nominal, dan jadwal reminder (cron).</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">DP Persen (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={dpPercent}
                onChange={(e) => setDpPercent(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-28 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Min DP (Rp)</label>
              <input
                type="number"
                min={0}
                value={dpMinAmount}
                onChange={(e) => setDpMinAmount(Number(e.target.value))}
                disabled={loading || saving}
                className="h-9 w-32 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Hari Reminder</label>
              <input
                type="text"
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                disabled={loading || saving}
                placeholder="7,3,0,-1"
                className="h-9 w-40 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
            </div>
            {!isOwner && (
              <button
                type="button"
                onClick={save}
                disabled={loading || saving}
                className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Site Map Kavling</div>
            <div className="mt-1 text-xs text-muted">Upload file PNG untuk mengganti gambar site map tanpa ubah kode.</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <img
              src={`/kavling/site-map.png?v=${siteMapVersion}`}
              alt="Site Map Kavling"
              className="h-28 w-44 rounded-xl border border-border bg-background object-contain"
            />
            {!isOwner ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  type="file"
                  accept="image/png"
                  onChange={(e) => {
                    const f = (e.target.files?.item(0) as File | null) ?? null;
                    if (!f) return;
                    void openSiteMapCrop(f);
                    e.currentTarget.value = "";
                  }}
                  disabled={loading || saving || siteMapUploading}
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="text-xs text-muted">Owner hanya bisa melihat.</div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={siteMapCropOpen}
        title="Crop Site Map"
        onClose={() => {
          setSiteMapCropOpen(false);
          setSiteMapCropSrc(null);
          setSiteMapCropNatural(null);
          setSiteMapCropRect(null);
          setSiteMapFile(null);
        }}
        maxWidthClassName="max-w-4xl"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={setCropRectFull}
                disabled={!siteMapCropNatural}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                Full
              </button>
              <button
                type="button"
                onClick={() => setCropRectCenteredRatio(16 / 9)}
                disabled={!siteMapCropNatural}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                16:9
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSiteMapCropOpen(false);
                  setSiteMapCropSrc(null);
                  setSiteMapCropNatural(null);
                  setSiteMapCropRect(null);
                  setSiteMapFile(null);
                }}
                disabled={siteMapUploading}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void exportCropAndUpload()}
                disabled={!siteMapCropNatural || !siteMapCropRect || siteMapUploading}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {siteMapUploading ? "Mengupload..." : "Simpan & Upload"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background">
            {siteMapCropSrc ? (
              <div className="relative">
                <img
                  ref={siteMapCropImgRef}
                  src={siteMapCropSrc}
                  alt="Preview"
                  className="w-full select-none"
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setSiteMapCropNatural({ w: el.naturalWidth, h: el.naturalHeight });
                    setSiteMapCropRect({ x: 0, y: 0, w: el.naturalWidth, h: el.naturalHeight });
                  }}
                />
                {siteMapCropNatural && siteMapCropRect ? (() => {
                  const natural = siteMapCropNatural;
                  const cropRect = siteMapCropRect;
                  const img = siteMapCropImgRef.current;
                  if (!img) return null;
                  const r = img.getBoundingClientRect();
                  const scaleX = r.width / Math.max(1, natural.w);
                  const scaleY = r.height / Math.max(1, natural.h);
                  const left = cropRect.x * scaleX;
                  const top = cropRect.y * scaleY;
                  const width = cropRect.w * scaleX;
                  const height = cropRect.h * scaleY;

                  function clampRect(next: { x: number; y: number; w: number; h: number }) {
                    const minSize = 32;
                    const x = Math.max(0, Math.min(natural.w - minSize, next.x));
                    const y = Math.max(0, Math.min(natural.h - minSize, next.y));
                    const w = Math.max(minSize, Math.min(natural.w - x, next.w));
                    const h = Math.max(minSize, Math.min(natural.h - y, next.h));
                    return { x, y, w, h };
                  }

                  function startDrag(kind: "move" | "nw" | "ne" | "sw" | "se", clientX: number, clientY: number) {
                    siteMapCropDragRef.current = { kind, startX: clientX, startY: clientY, rect: cropRect };
                  }

                  function onMove(clientX: number, clientY: number) {
                    const st = siteMapCropDragRef.current;
                    if (!st) return;
                    const dx = (clientX - st.startX) / scaleX;
                    const dy = (clientY - st.startY) / scaleY;
                    const base = st.rect;
                    if (st.kind === "move") {
                      setSiteMapCropRect(clampRect({ ...base, x: base.x + dx, y: base.y + dy }));
                      return;
                    }
                    if (st.kind === "nw") {
                      setSiteMapCropRect(clampRect({ x: base.x + dx, y: base.y + dy, w: base.w - dx, h: base.h - dy }));
                      return;
                    }
                    if (st.kind === "ne") {
                      setSiteMapCropRect(clampRect({ x: base.x, y: base.y + dy, w: base.w + dx, h: base.h - dy }));
                      return;
                    }
                    if (st.kind === "sw") {
                      setSiteMapCropRect(clampRect({ x: base.x + dx, y: base.y, w: base.w - dx, h: base.h + dy }));
                      return;
                    }
                    setSiteMapCropRect(clampRect({ x: base.x, y: base.y, w: base.w + dx, h: base.h + dy }));
                  }

                  function endDrag() {
                    siteMapCropDragRef.current = null;
                  }

                  const handleBase = "absolute h-3 w-3 rounded-full bg-primary";

                  return (
                    <div
                      className="absolute inset-0"
                      onPointerMove={(e) => {
                        if (!siteMapCropDragRef.current) return;
                        e.preventDefault();
                        onMove(e.clientX, e.clientY);
                      }}
                      onPointerUp={() => endDrag()}
                      onPointerCancel={() => endDrag()}
                      style={{ touchAction: "none" }}
                    >
                      <div
                        className="absolute border-2 border-primary bg-transparent"
                        style={{ left, top, width, height, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)" }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startDrag("move", e.clientX, e.clientY);
                        }}
                      />

                      <button
                        type="button"
                        className={handleBase}
                        style={{ left: left - 6, top: top - 6 }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startDrag("nw", e.clientX, e.clientY);
                        }}
                      />
                      <button
                        type="button"
                        className={handleBase}
                        style={{ left: left + width - 6, top: top - 6 }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startDrag("ne", e.clientX, e.clientY);
                        }}
                      />
                      <button
                        type="button"
                        className={handleBase}
                        style={{ left: left - 6, top: top + height - 6 }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startDrag("sw", e.clientX, e.clientY);
                        }}
                      />
                      <button
                        type="button"
                        className={handleBase}
                        style={{ left: left + width - 6, top: top + height - 6 }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startDrag("se", e.clientX, e.clientY);
                        }}
                      />
                    </div>
                  );
                })() : null}
              </div>
            ) : (
              <div className="p-6 text-sm text-muted">Pilih file PNG untuk mulai crop.</div>
            )}
          </div>
        </div>
      </Modal>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Payment Gateway (Xendit)</div>
            <div className="mt-1 text-xs text-muted">Key disimpan di database dan hanya bisa diubah oleh admin.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Secret Key</label>
            <input
              type="password"
              value={xenditSecretKeyInput}
              onChange={(e) => setXenditSecretKeyInput(e.target.value)}
              disabled={loading || saving}
              placeholder={xenditSecretKeySet ? "Tersimpan (isi untuk mengganti)" : "Belum di-set"}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="text-[11px] text-muted">{xenditSecretKeySet ? "Status: tersimpan" : "Status: belum tersimpan"}</div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Callback Token</label>
            <input
              type="password"
              value={xenditCallbackTokenInput}
              onChange={(e) => setXenditCallbackTokenInput(e.target.value)}
              disabled={loading || saving}
              placeholder={xenditCallbackTokenSet ? "Tersimpan (isi untuk mengganti)" : "Belum di-set"}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="text-[11px] text-muted">{xenditCallbackTokenSet ? "Status: tersimpan" : "Status: belum tersimpan"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Metode Pembayaran & Biaya Layanan</div>
            <div className="mt-1 text-xs text-muted">
              Mengatur metode pembayaran yang tampil di checkout Xendit, dan biaya layanan internal per metode (untuk operasional).
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-background">
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tampilkan</th>
                <th className="px-4 py-3 font-medium">Metode</th>
                <th className="px-4 py-3 font-medium">Kode</th>
                <th className="px-4 py-3 font-medium">Biaya layanan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {xenditPaymentMethods.map((m) => (
                <tr key={m.code} className="text-foreground">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      disabled={loading || saving || isOwner}
                      onChange={(e) =>
                        setXenditPaymentMethods((s) =>
                          s.map((x) => (x.code === m.code ? { ...x, enabled: e.target.checked } : x)),
                        )
                      }
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3">{m.label}</td>
                  <td className="px-4 py-3 text-xs text-muted">{m.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-muted">
                        <div className="rounded-lg border border-border bg-surface px-2 py-2">%</div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={m.feeBps / 100}
                          disabled={loading || saving || isOwner}
                          onChange={(e) =>
                            setXenditPaymentMethods((s) =>
                              s.map((x) => {
                                if (x.code !== m.code) return x;
                                const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                return { ...x, feeBps: Math.max(0, Math.min(10_000, Math.round(pct * 100))) };
                              }),
                            )
                          }
                          className="h-9 w-28 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted">
                        <div className="rounded-lg border border-border bg-surface px-2 py-2">Rp</div>
                        <input
                          type="number"
                          min={0}
                          value={m.feeFlat}
                          disabled={loading || saving || isOwner}
                          onChange={(e) =>
                            setXenditPaymentMethods((s) =>
                              s.map((x) =>
                                x.code === m.code ? { ...x, feeFlat: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x,
                              ),
                            )
                          }
                          className="h-9 w-40 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Email (SMTP)</div>
            <div className="mt-1 text-xs text-muted">Dipakai untuk notifikasi pembayaran dan kirim invoice.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">SMTP Host</label>
            <input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              disabled={loading || saving}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value ? Number(e.target.value) : "")}
              disabled={loading || saving}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Username</label>
            <input
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              disabled={loading || saving}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Password</label>
            <input
              type="password"
              value={smtpPasswordInput}
              onChange={(e) => setSmtpPasswordInput(e.target.value)}
              disabled={loading || saving}
              placeholder={smtpPasswordSet ? "Tersimpan (isi untuk mengganti)" : "Belum di-set"}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="text-[11px] text-muted">{smtpPasswordSet ? "Status: tersimpan" : "Status: belum tersimpan"}</div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Enkripsi</label>
            <select
              value={smtpSecure ? "ssl" : "starttls"}
              onChange={(e) => setSmtpSecure(e.target.value === "ssl")}
              disabled={loading || saving}
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="ssl">SSL/TLS</option>
              <option value="starttls">STARTTLS</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">From Name</label>
            <input
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              disabled={loading || saving}
              placeholder="Woodforest Jayagiri 48"
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-foreground">Email notifikasi admin (opsional)</label>
            <input
              value={paymentNotifyEmails}
              onChange={(e) => setPaymentNotifyEmails(e.target.value)}
              disabled={loading || saving}
              placeholder="Pisahkan dengan koma. Contoh: admin@contoh.com, owner@contoh.com"
              className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <div className="text-[11px] text-muted">Jika diisi, sistem kirim email notifikasi ketika pembayaran berhasil.</div>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-foreground">Test Kirim Email</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={smtpTestTo}
                onChange={(e) => setSmtpTestTo(e.target.value)}
                disabled={loading || saving || smtpTestSending}
                placeholder="email tujuan untuk test"
                className="h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
              <button
                type="button"
                disabled={loading || saving || smtpTestSending || !smtpTestTo.trim()}
                onClick={async () => {
                  setSmtpTestSending(true);
                  setSmtpTestResult(null);
                  const res = await fetch("/api/dashboard/email/test", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ to: smtpTestTo.trim() }),
                  });
                  const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
                  if (!res.ok) setSmtpTestResult(data?.message ?? "Gagal kirim test email");
                  else setSmtpTestResult("Test email berhasil dikirim. Cek inbox/spam.");
                  setSmtpTestSending(false);
                }}
                className="h-9 shrink-0 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-background disabled:opacity-60"
              >
                {smtpTestSending ? "Mengirim..." : "Kirim Test"}
              </button>
            </div>
            {smtpTestResult ? <div className="text-[11px] text-muted">{smtpTestResult}</div> : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          {!isOwner && (
            <button
              type="button"
              onClick={save}
              disabled={loading || saving}
              className="h-9 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
