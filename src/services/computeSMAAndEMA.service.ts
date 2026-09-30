import { calculateEMA } from "../utils/indicators/ema";

/**
 * Compute SMA and EMA
 *
 * @param prices Close prices of 5 minutes interval
 * @returns Return RSI Object for DB update
 */
export const computeSMAAndEMA = (prices: number[]) => {
  try {
    if (!prices || prices.length === 0) {
      return null;
    }

    // =========================
    // 1) Calculate EMA
    // =========================

    const ema20 = calculateEMA(prices, 20);
    const ema50 = calculateEMA(prices, 50);
    const ema200 = calculateEMA(prices, 200);

    const setObj: any = {
      ema20: ema20[ema20.length - 1] ?? 0,
      ema50: ema50[ema50.length - 1] ?? 0,
      ema200: ema200[ema200.length - 1] ?? 0,
    };
    return setObj;
  } catch (err: any) {
    console.error("[computeSMAAndEMA] error for", err?.response?.data || err);
    return null;
  }
};
