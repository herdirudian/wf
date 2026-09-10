/**
 * Utility functions for parsing and managing Kavling number/code lists.
 * Supports alphanumeric codes (e.g. "S1", "V1", "C1", "N1"),
 * range formats (e.g. "S1-S4", "V1-V6", "1-57"), and individual comma-separated codes.
 */

export function parseKavlingList(input: string | null | undefined): string[] {
  if (!input || !input.trim()) return [];
  const items = new Set<string>();
  const parts = input.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Check if range format like s1-s4 or 1-57 or c1-c11
    if (trimmed.includes("-")) {
      const segments = trimmed.split("-").map((s) => s.trim());
      if (segments.length === 2) {
        const matchStart = segments[0].match(/^([a-zA-Z]*)(\d+)$/);
        const matchEnd = segments[1].match(/^([a-zA-Z]*)(\d+)$/);

        if (matchStart && matchEnd) {
          const prefixStart = matchStart[1].toUpperCase();
          const prefixEnd = matchEnd[1].toUpperCase();
          const startNum = parseInt(matchStart[2], 10);
          const endNum = parseInt(matchEnd[2], 10);

          if ((prefixStart === prefixEnd || !prefixEnd) && startNum <= endNum) {
            const prefix = prefixStart;
            for (let i = startNum; i <= endNum; i++) {
              items.add(prefix ? `${prefix}${i}` : `${i}`);
            }
            continue;
          }
        }
      }
    }

    items.add(trimmed.toUpperCase());
  }

  return Array.from(items).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

export function formatKavlingList(codes: (string | number)[]): string {
  if (!codes || !codes.length) return "";
  const strCodes = codes.map((c) => String(c).toUpperCase());
  const sorted = Array.from(new Set(strCodes)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  return sorted.join(", ");
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

  // Fallback if regularList is empty and no string was supplied
  if (regularList.length === 0 && (!config.regularKavlingsList || !config.regularKavlingsList.trim())) {
    const all = Array.from({ length: sellCount }, (_, i) => String(i + 1));
    regularList = all.filter((n) => {
      const num = parseInt(n, 10);
      return num < pStart || num > pEnd;
    });
  }

  // Fallback if privateList is empty and no string was supplied
  if (privateList.length === 0 && (!config.privateKavlingsList || !config.privateKavlingsList.trim())) {
    privateList = Array.from({ length: Math.max(0, pEnd - pStart + 1) }, (_, i) => String(pStart + i));
  }

  const regularSet = new Set(regularList);
  const privateSet = new Set(privateList);
  const allList = Array.from(new Set([...regularList, ...privateList])).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

  return {
    regularList,
    privateList,
    regularSet,
    privateSet,
    allList,
    totalCount: allList.length,
  };
}
