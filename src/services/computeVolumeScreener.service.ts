import { CandleData } from "../interface/file.interface";
import { detectVolumeExpansionOnCandles } from "../utils/indicators/volume";

const VOLUME_TIMEFRAME = "5M";

/**
 * Compute Volume Screener
 *
 * @param dhandata Fetches 15M intraday data once per stock
 * @returns Return Volume Object for DB update
 */
export const computeVolumeScreener = (dhandata: {
  volume: number[];
  timestamp: number[];
}) => {
  try {
    const { timestamp, volume } = dhandata;
    if (!timestamp || !volume) {
      return null;
    }

    const volumeSignals = detectVolumeExpansionOnCandles(
      { volume, timestamp },
      20,
      2,
    );
    const setObj: any = {};

    // --- Volume fields (always update latest) ---
    if (volumeSignals) {
      setObj.volume_timeframe = VOLUME_TIMEFRAME;
      setObj.volume_ratio = volumeSignals.ratio;
      setObj.volume_signal = volumeSignals.signal;
      setObj.today_volume = volumeSignals.volume;
      setObj.average_20_volume = volumeSignals.avgVolume;
      setObj.volume_entry = volumeSignals.timestamp;
    }

    return setObj;
  } catch (err: any) {
    console.error(
      "[computeVolumeScreener] error for",
      err?.response?.data || err,
    );
    return null;
  }
};
