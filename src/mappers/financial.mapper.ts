export function sanitizeKey(key: string): string {
  return key.toLowerCase().replace(/\./g, ""); // remove dots
  // .replace(/%/g, "percent")
  // .replace(/[^a-z0-9]+/g, "_") // spaces & symbols → _
  // .replace(/^_|_$/g, "");
}

export function sanitizeNestedNumberMap(
  input: Record<string, Record<string, number | string | null | undefined>>
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const outerKey in input) {
    const safeOuterKey = sanitizeKey(outerKey);
    result[safeOuterKey] = {};

    for (const innerKey in input[outerKey]) {
      const safeInnerKey = sanitizeKey(innerKey);

      const value = input[outerKey][innerKey];
      let numValue = 0;

      if (typeof value === "number" && !Number.isNaN(value)) {
        numValue = value;
      } else if (typeof value === "string") {
        // Remove % and commas, then parse
        const cleanStr = value.replace(/[%,\s]/g, "");
        const parsed = parseFloat(cleanStr);
        if (!Number.isNaN(parsed)) {
          numValue = parsed;
        }
      }

      result[safeOuterKey][safeInnerKey] = numValue;
    }
  }

  return result;
}

export function mapFinancialData(isin: string, raw: any) {
  return {
    isin,
    quarter_results: sanitizeNestedNumberMap(raw.quarter_results || {}),
    yoy_results: sanitizeNestedNumberMap(raw.yoy_results || {}),
    balancesheet: sanitizeNestedNumberMap(raw.balancesheet || {}),
    cashflow: sanitizeNestedNumberMap(raw.cashflow || {}),
    ratios: sanitizeNestedNumberMap(raw.ratios || {}),
    shareholding_pattern_quarterly: sanitizeNestedNumberMap(
      raw.shareholding_pattern_quarterly || {}
    ),
    shareholding_pattern_yearly: sanitizeNestedNumberMap(
      raw.shareholding_pattern_yearly || {}
    ),
    profit_loss_stats: sanitizeNestedNumberMap(raw.profit_loss_stats || {}),
  };
}
