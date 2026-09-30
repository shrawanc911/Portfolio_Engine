import { calculateRSI } from "../utils/indicators/rsi";

const RSI_TIMEFRAME = "5M";

/**
 * Compute RSI Screener
 *
 * @param dhandata Fetches 15M intraday data once per stock
 * @param existing Existing stock details from DB
 * @param now Time of last candle
 * @returns Return RSI Object for DB update
 */
export const computeRSIScreener = (
  dhandata: { close: number[]; timestamp: number[] },
  existing: any,
  now: Date,
) => {
  try {
    const { close, timestamp } = dhandata;
    if (!close || !timestamp || close.length === 0) {
      return null;
    }

    // =========================
    // 1) RSI from ALL data
    // =========================
    let rsi: number | null = null;
    let rsi_signal: "Bullish" | "Bearish" | null = null;

    if (close.length >= 15) {
      rsi = calculateRSI(close, 14);
      if (rsi < 30)
        rsi_signal = "Bullish"; // oversold
      else if (rsi > 70) rsi_signal = "Bearish"; // overbought
    }

    // =========================
    // 2) Build SINGLE merged DB update with smart entry times
    // =========================
    const setObj: any = {};

    // --- RSI fields ---
    if (rsi !== null) {
      setObj.rsi = rsi;
      setObj.rsi_signal = rsi_signal;
      setObj.rsi_timeframe = RSI_TIMEFRAME;

      // Smart entry: only update rsi_entry if signal changed
      if (existing?.rsi_signal === rsi_signal && existing?.rsi_entry) {
        setObj.rsi_entry = existing.rsi_entry; // preserve old entry time
      } else {
        setObj.rsi_entry = now; // signal changed → new entry time
      }
    }
    return setObj;
  } catch (err: any) {
    console.error("[computeRSIScreener] error for", err?.response?.data || err);
    return null;
  }
};
