import {
  type CandleData,
  type VolumeExpansionCandleResult,
} from "../../interface/file.interface";
import { getTimeISTFromUnix, getTodayDateIST } from "./time";

export interface DailyVolume {
  date: string; // "YYYY-MM-DD"
  totalVolume: number;
}

export interface VolumeExpansionResult {
  todayVolume: number;
  avg20DayVolume: number;
  timestamp: Date | null;
  signal: "Hit" | null;
}

export function calculateVolumeSMA(
  volumes: number[],
  period: number,
): Array<number | undefined> {
  const result: Array<number | undefined> = new Array(volumes.length).fill(
    undefined,
  );

  if (volumes.length < period) return result;

  let sum = 0;

  for (let i = 0; i < volumes.length; i++) {
    const curr = volumes[i];

    if (curr === undefined) continue;

    sum += curr;

    if (i >= period) {
      const old = volumes[i - period];
      if (old !== undefined) {
        sum -= old;
      }
    }

    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }

  return result;
}

/**
 * Calculates volume expansion signal based on:
 * - 20-day average DAILY volume
 * - Today's partial volume (till specific times)
 *
 * @param data Candle data containing volume, timestamp and close arrays
 * @param period Number of candles to use for average volume (default: 20)
 * @param multiplier x1, x2 for multiplier result (default: 2)
 * @returns Array of VolumeSpikeSignal
 */
export function detectVolumeExpansionOnCandles(
  data: { volume: number[]; timestamp: number[] },
  period: number = 20,
  multiplier: number = 2,
): VolumeExpansionCandleResult | null {
  const volumes = data.volume;
  const timestamps = data.timestamp;
  if (!volumes || volumes.length < period) return null;

  const vma = calculateVolumeSMA(volumes, period);

  const currVol = volumes[volumes.length - 1];
  const avgVol = vma[vma.length - 1];

  if (currVol === undefined || avgVol === undefined) return null;

  const ts = timestamps[timestamps.length - 1] ?? 0;
  if (currVol > multiplier * avgVol) {
    return {
      index: timestamps.length - 1,
      timestamp: new Date(ts * 1000), // assuming seconds
      volume: currVol,
      avgVolume: avgVol,
      ratio: currVol / avgVol,
      signal: "Hit",
    };
  }

  return {
    index: timestamps.length - 1,
    timestamp: new Date(ts * 1000), // assuming seconds
    volume: currVol,
    avgVolume: avgVol,
    ratio: currVol / avgVol,
    signal: null,
  };
}

/**
 * Get Last completed candle index
 * @param timestamps Lists of timestamps with the interval
 * @param intervalMinutes 5,15 or 60
 * @returns Return index of last completed candle
 */
export function getLastCompletedCandleIndex(
  timestamps: number[],
  intervalMinutes: number,
): number | null {
  const now = new Date();

  for (let i = timestamps.length - 1; i >= 0; i--) {
    const ts = timestamps[i];
    if (!ts) {
      continue;
    }
    const candleStart = new Date(ts * 1000);
    const candleClose = new Date(
      candleStart.getTime() + intervalMinutes * 60 * 1000,
    );

    if (now >= candleClose) {
      return i; // last completed candle
    }
  }

  return null;
}
