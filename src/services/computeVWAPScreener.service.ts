import { CandleData } from "../interface/file.interface";
import { getTimeISTFromUnix, getTodayDateIST } from "../utils/indicators/time";
import { calculateVWAP } from "../utils/indicators/vwap";

const VWAP_TIMEFRAME = "5M";

/**
 * Compute VWAP Screener
 *
 * @param dhandata Fetches 15M intraday data once per stock
 * @param existing Existing stock details from DB
 * @param now Time of last candle
 * @returns Return VWAP Object for DB update
 */
export const computeVWAPScreener = (
  dhandata: CandleData,
  existing: any,
  now: Date,
) => {
  try {
    const { open, timestamp, high, low, close, volume } = dhandata;
    if (
      !open ||
      !timestamp ||
      !high ||
      !low ||
      !close ||
      !volume ||
      close.length === 0
    ) {
      return null;
    }
    
    const today = getTodayDateIST();

    const todayHigh: number[] = [];
    const todayLow: number[] = [];
    const todayClose: number[] = [];
    const todayVolume: number[] = [];

    for (let i = 0; i < timestamp.length; i++) {
      const ts = timestamp[i];
      const h = high[i];
      const l = low[i];
      const c = close[i];
      const v = volume[i];

      if (!ts || !h || !l || !c || !v) {
        continue;
      }

      const { date } = getTimeISTFromUnix(ts);
      if (date === today) {
        todayHigh.push(h);
        todayLow.push(l);
        todayClose.push(c);
        todayVolume.push(v);
      }
    }

    if (todayClose.length < 2) {
      // Not enough intraday data for VWAP signal
      return null;
    }

    const { vwap, vwap_signal } = calculateVWAP({
      todayHigh,
      todayLow,
      todayClose,
      todayVolume,
    });

    const setObj: any = {};

    // --- VWAP fields ---
    if (vwap !== null) {
      setObj.vwap = vwap;
      setObj.vwap_signal = vwap_signal;
      setObj.vwap_timeframe = VWAP_TIMEFRAME;

      // Smart entry: only update vwap_entry if signal changed
      if (existing?.vwap_signal === vwap_signal && existing?.vwap_entry) {
        setObj.vwap_entry = existing.vwap_entry; // preserve old entry time
      } else {
        setObj.vwap_entry = now; // signal changed → new entry time
      }
    }

    return setObj;
  } catch (err: any) {
    console.error(
      "[computeVWAPScreener] error for",
      err?.response?.data || err,
    );
    return null;
  }
};
