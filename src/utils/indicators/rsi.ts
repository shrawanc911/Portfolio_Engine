
/**
 * Calculate RSI using Wilder's smoothing method (broker-style)
 * @param prices Array of closing prices (oldest -> newest)
 * @param period RSI period (default 14)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (!Array.isArray(prices)) {
    throw new Error("Prices must be an array");
  }

  if (prices.length < period + 1) {
    throw new Error(`Need at least ${period + 1} prices to calculate RSI`);
  }

  // 1️⃣ Calculate initial average gain/loss
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const curr = prices[i];
    const prev = prices[i - 1];

    if (curr === undefined || prev === undefined) {
      throw new Error("Invalid price data");
    }

    const diff = curr - prev;

    if (diff > 0) {
      gainSum += diff;
    } else {
      lossSum += -diff; // make positive
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // 2️⃣ Wilder smoothing for the rest of the data
  for (let i = period + 1; i < prices.length; i++) {
    const curr = prices[i];
    const prev = prices[i - 1];

    if (curr === undefined || prev === undefined) {
      throw new Error("Invalid price data");
    }

    const diff = curr - prev;

    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // 3️⃣ Compute RSI
  if (avgLoss === 0) {
    return 100; // no losses => RSI = 100
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  // Round to 2 decimals (like most brokers)
  return Math.round(rsi * 100) / 100;
}
