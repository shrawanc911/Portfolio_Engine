/**
 * Calculate SMA
 * @param prices Array of closing prices (oldest -> newest)
 * @param period SMA period (default 10)
 * @returns Array of SMA values (index-aligned with prices, early values undefined)
 */
export function calculateSMA(
  prices: number[],
  period: number = 10,
): Array<number | undefined> {
  const sma: Array<number | undefined> = new Array(prices.length).fill(
    undefined,
  );

  if (prices.length < period) return sma;

  let sum = 0;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    if (price === undefined) continue;

    sum += price;

    // remove value leaving window
    if (i >= period) {
      const prev = prices[i - period];
      if (prev === undefined) continue;
      sum -= prev;
    }

    // first valid SMA
    if (i >= period - 1) {
      sma[i] = sum / period;
    }
  }

  return sma;
}
