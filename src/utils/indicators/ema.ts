import { type CrossSignal } from "../../interface/file.interface";
import { getTimeISTFromUnix } from "./time";

export function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

/**
 * Calculate EMA
 * @param prices Array of closing prices (oldest -> newest)
 * @param period EMA period (default 10)
 * @returns Array of EMA values (index-aligned with prices, early values undefined)
 */
export function calculateEMA(
  prices: number[],
  period: number = 10,
): Array<number | undefined> {
  const k = 2 / (period + 1);
  const ema: Array<number | undefined> = new Array(prices.length).fill(
    undefined,
  );

  if (prices.length < period) return ema;

  // Start with SMA for first value
  let sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = sma;

  for (let i = period; i < prices.length; i++) {
    const prev = ema[i - 1];
    const price = prices[i];
    if (prev === undefined || price === undefined) continue; // safety guard

    ema[i] = price * k + prev * (1 - k);
  }

  return ema;
}

export function collectCrossSignals(
  closes: number[],
  timestamps: number[],
): CrossSignal | null {
  const ema10 = calculateEMA(closes, 10);
  const ema20 = calculateEMA(closes, 20);

  const signals: CrossSignal[] = [];

  for (let i = 1; i < closes.length; i++) {
    const e10_prev = ema10[i - 1];
    const e20_prev = ema20[i - 1];
    const e10_curr = ema10[i];
    const e20_curr = ema20[i];
    const timestamp = timestamps[i];
    const price = closes[i];

    // Skip if EMA not ready yet
    if (
      e10_prev === undefined ||
      e20_prev === undefined ||
      e10_curr === undefined ||
      e20_curr === undefined ||
      timestamp === undefined ||
      price === undefined
    ) {
      continue;
    }
    const { date, time } = getTimeISTFromUnix(timestamp);
    // BUY: 10 crosses above 20
    if (e10_prev <= e20_prev && e10_curr > e20_curr) {
      signals.push({
        type: "Bullish",
        index: i,
        timestamp: new Date(timestamp * 1000),
        price: price,
        ema10: e10_curr,
        ema20: e20_curr,
      });
    }

    // SELL: 10 crosses below 20
    else if (e10_prev >= e20_prev && e10_curr < e20_curr) {
      signals.push({
        type: "Bearish",
        index: i,
        timestamp: new Date(timestamp * 1000),
        price: price,
        ema10: e10_curr,
        ema20: e20_curr,
      });
    }
  }

  if (signals.length > 0) {
    return signals[signals.length - 1] ?? null;
  }
  return null;
}
