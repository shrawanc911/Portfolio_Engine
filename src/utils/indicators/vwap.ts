type VWAPSignal = "Bullish" | "Bearish" | null;

interface VWAPResult {
  vwap: number | null;
  vwap_signal: VWAPSignal;
}

interface DhanVWAPInput {
  todayHigh: number[];
  todayLow: number[];
  todayClose: number[];
  todayVolume: number[];
}

/**
 * Calculate RSI using Wilder's smoothing method (broker-style)
 * @param dhanData Array of closing prices (oldest -> newest)
 * @returns {VWAPResult} last VWAP value and VWAP signal
 */
export function calculateVWAP(dhanData: DhanVWAPInput): VWAPResult {
  const { todayHigh, todayLow, todayClose, todayVolume } = dhanData;

  // =========================
  // 1) VWAP from today's data only
  // =========================
  let cumPV = 0;
  let cumVol = 0;
  let vwapSeries: number[] = [];

  for (let i = 0; i < todayClose.length; i++) {
    const h = todayHigh[i];
    const l = todayLow[i];
    const c = todayClose[i];
    const v = todayVolume[i];

    if (
      h === undefined ||
      l === undefined ||
      c === undefined ||
      v === undefined
    ) {
      continue; // safety guard, should not happen, but keeps TS + runtime safe
    }
    const tp = (h + l + c) / 3;
    const pv = tp * v;

    cumPV += pv;
    cumVol += v;

    vwapSeries.push(cumPV / cumVol);
  }

  let vwap_signal: "Bullish" | "Bearish" | null = null;

  if (todayClose.length > 1) {
    const prev = todayClose.length - 2;
    const curr = todayClose.length - 1;

    const prevClose = todayClose[prev] ?? 0;
    const currClose = todayClose[curr] ?? 0;
    const prevVWAP = vwapSeries[prev] ?? 0;
    const currVWAP = vwapSeries[curr] ?? 0;

    const prevHigh = todayHigh[prev] ?? 0;
    const prevLow = todayLow[prev] ?? 0;

    if (prevClose > prevVWAP && currClose > currVWAP && currClose > prevHigh) {
      vwap_signal = "Bullish";
    } else if (
      prevClose < prevVWAP &&
      currClose < currVWAP &&
      currClose < prevLow
    ) {
      vwap_signal = "Bearish";
    }
  }

  const lastVWAP = vwapSeries[vwapSeries.length - 1] ?? null;

  return { vwap: lastVWAP, vwap_signal };
}
