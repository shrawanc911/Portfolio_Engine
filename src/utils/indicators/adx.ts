/**
 * Calculate ADX using array-based OHLC data
 * @param input { high[], low[], close[], timestamp[] }
 * @param period default 14
 */
export function calculateADXFromArrays(
  input: {
    high: number[];
    low: number[];
    close: number[];
    timestamp: number[];
  },
  period: number = 14,
) {
  const { high, low, close, timestamp } = input;

  const length = high.length;

  if (
    length !== low.length ||
    length !== close.length ||
    length !== timestamp.length ||
    length < period * 2
  ) {
    throw new Error("Invalid input length for ADX calculation");
  }

  const tr = new Array(length).fill(0);
  const plusDM = new Array(length).fill(0);
  const minusDM = new Array(length).fill(0);

  // Step 1: Calculate TR, +DM, -DM
  for (let i = 1; i < length; i++) {
    const curHigh = high[i] ?? 0;
    const prevHigh = high[i - 1] ?? 0;

    const currLow = low[i] ?? 0;
    const prevLow = low[i - 1] ?? 0;

    const prevClose = close[i - 1] ?? 0;

    const highDiff = curHigh - prevHigh;
    const lowDiff = prevLow - currLow;

    tr[i] = Math.max(
      curHigh - currLow,
      Math.abs(curHigh - prevClose),
      Math.abs(currLow - prevClose),
    );

    plusDM[i] = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM[i] = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
  }

  // Step 2: Wilder Smoothing
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 1; i <= period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  const plusDI = new Array(length).fill(null);
  const minusDI = new Array(length).fill(null);
  const dx = new Array(length).fill(null);
  const adx = new Array(length).fill(null);

  // Step 3: First DI & DX
  let plusDIValue = (smoothPlusDM / smoothTR) * 100;
  let minusDIValue = (smoothMinusDM / smoothTR) * 100;

  plusDI[period] = plusDIValue;
  minusDI[period] = minusDIValue;

  dx[period] =
    (Math.abs(plusDIValue - minusDIValue) / (plusDIValue + minusDIValue)) * 100;

  // Step 4: Continue smoothing
  for (let i = period + 1; i < length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    plusDIValue = (smoothPlusDM / smoothTR) * 100;
    minusDIValue = (smoothMinusDM / smoothTR) * 100;

    plusDI[i] = plusDIValue;
    minusDI[i] = minusDIValue;

    dx[i] =
      (Math.abs(plusDIValue - minusDIValue) / (plusDIValue + minusDIValue)) *
      100;
  }

  // Step 5: First ADX
  let adxSum = 0;
  for (let i = period; i < period * 2; i++) {
    adxSum += dx[i] ?? 0;
  }

  adx[period * 2 - 1] = adxSum / period;

  // Step 6: Wilder smoothing of ADX
  for (let i = period * 2; i < length; i++) {
    adx[i] =
      ((adx[i - 1] as number) * (period - 1) + (dx[i] as number)) / period;
  }
  if (adx.length <= 15) {
    return { currADX: null, prevADX: null };
  }
  return { currADX: adx[adx.length - 1], prevADX: adx[adx.length - 2] };
  // ✅ ONLY CHANGE: return structured output
  //   return timestamp.map((ts, i) => ({
  //     timestamp: getTimeISTFromUnix(ts),
  //     close: close[i],
  //     adx: adx[i],
  //     plusDI: plusDI[i],
  //     minusDI: minusDI[i],
  //   }));
}
