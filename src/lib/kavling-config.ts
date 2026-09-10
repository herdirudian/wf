/**
 * Utility functions for parsing and managing Kavling number lists.
 * Supports ranges (e.g. "1-57, 66-110") and individual numbers (e.g. "1, 2, 3, 5, 10").
 */

export function parseKavlingList(input: string | null | undefined): number[] {
  if (!input || !input.trim()) return [];
  const numbers = new Set<number>();
  const parts = input.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const segments = trimmed.split("-").map((s) => s.trim());
      if (segments.length === 2) {
        const start = parseInt(segments[0], 10);
        const end = parseInt(segments[1], 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            numbers.add(i);
          }
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && Number.isFinite(num)) {
        numbers.add(num);
      }
    }
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

export function formatKavlingList(numbers: number[]): string {
  if (!numbers || !numbers.length) return "";
  const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}

export function getKavlingSets(config: {
  regularKavlingsList?: string | null;
  privateKavlingsList?: string | null;
  kavlingSellCount?: number;
  privateKavlingStart?: number;
  privateKavlingEnd?: number;
}) {
  const sellCount = config.kavlingSellCount ?? 110;
  const pStart = config.privateKavlingStart ?? 58;
  const pEnd = config.privateKavlingEnd ?? 65;

  let regularList = parseKavlingList(config.regularKavlingsList);
  let privateList = parseKavlingList(config.privateKavlingsList);

  // Fallback if regularList is empty
  if (regularList.length === 0) {
    const all = Array.from({ length: sellCount }, (_, i) => i + 1);
    regularList = all.filter((n) => n < pStart || n > pEnd);
  }

  // Fallback if privateList is empty
  if (privateList.length === 0) {
    privateList = Array.from({ length: Math.max(0, pEnd - pStart + 1) }, (_, i) => pStart + i);
  }

  const regularSet = new Set(regularList);
  const privateSet = new Set(privateList);
  const allList = Array.from(new Set([...regularList, ...privateList])).sort((a, b) => a - b);

  return {
    regularList,
    privateList,
    regularSet,
    privateSet,
    allList,
    totalCount: allList.length,
  };
}
