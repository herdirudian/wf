const TZ_JAKARTA = "Asia/Jakarta";
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateWIB(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export function parseDateWIB(input: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) throw new Error("Format tanggal tidak valid");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) throw new Error("Format tanggal tidak valid");

  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  if (!Number.isFinite(d.getTime())) throw new Error("Tanggal tidak valid");
  return d;
}

export function startOfDayWIB(input: Date) {
  return parseDateWIB(formatDateWIB(input));
}

export function addDaysWIB(input: Date, days: number) {
  return new Date(input.getTime() + days * DAY_MS);
}

export function nightDatesWIB(checkIn: Date, checkOut: Date) {
  const start = startOfDayWIB(checkIn);
  const end = startOfDayWIB(checkOut);
  const nights = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (nights <= 0) return [];
  const dates: Date[] = [];
  for (let i = 0; i < nights; i++) dates.push(addDaysWIB(start, i));
  return dates;
}

export function parseDateRangeWIB(checkIn: string, checkOut: string) {
  const inDate = parseDateWIB(checkIn);
  const outDate = parseDateWIB(checkOut);
  if (outDate <= inDate) throw new Error("Tanggal check-out harus setelah check-in");
  return { checkIn: inDate, checkOut: outDate };
}
