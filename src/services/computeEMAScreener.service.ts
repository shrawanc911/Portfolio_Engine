import { CandleData } from "../interface/file.interface";
import { collectCrossSignals } from "../utils/indicators/ema";

const EMA_TIMEFRAME = "60M";

/**
 * Compute EMA Screener
 *
 * @param dhandata Fetches 60M intraday data once per stock
 * @param existing Existing stock details from DB
 * @returns Return EMA Object for DB update
 */
export const computeEMAScreener = (dhandata: CandleData, existing: any) => {
  try {
    const { timestamp, close } = dhandata;
    if (!timestamp || !close || close.length === 0) {
      return null;
    }

    const signals = collectCrossSignals(close, timestamp);
    if (!signals) {
      return null;
    }
    const setObj: any = {};

    // --- Volume fields (always update latest) ---
    if (signals) {
      setObj.ema_timeframe = EMA_TIMEFRAME;
      setObj.ema_signal = signals?.type;
      setObj.ema10 = signals?.ema10;
      setObj.ema20 = signals?.ema20;
      if (
        existing?.ema_signal == signals.type &&
        existing?.ema_cross_price &&
        existing?.ema_entry
      ) {
        setObj.ema_cross_price = existing.ema_cross_price;
        setObj.ema_entry = existing.ema_entry;
      } else {
        setObj.ema_cross_price = signals?.price;
        setObj.ema_entry = signals.timestamp;
      }
    }

    return setObj;
  } catch (err: any) {
    console.error("[computeEMAScreener] error for", err?.response?.data || err);
    return null;
  }
};
